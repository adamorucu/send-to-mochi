// src/mochi-api.ts
import { requestUrl } from "obsidian";

export class MochiClient {
    private apiKey: string;
    private baseUrl = "https://app.mochi.cards/api";

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getHeaders() {
        // Use btoa for base64 encoding (works in browser/Node environments)
        const encoded = btoa(this.apiKey + ":");
        return {
            "Authorization": `Basic ${encoded}`,
            "Content-Type": "application/json"
        };
    }

    private handleError(error: unknown, operation: string): never {
        if (error && typeof error === 'object' && 'status' in error) {
            const statusError = error as { status: number; text?: string; message?: string; url?: string };
            const urlInfo = statusError.url ? ` (URL: ${statusError.url})` : '';
            throw new Error(`${operation} failed: ${statusError.status} - ${statusError.text || statusError.message || 'Unknown error'}${urlInfo}`);
        }
        if (error instanceof Error) {
            throw new Error(`${operation} failed: ${error.message}`);
        }
        throw new Error(`${operation} failed: ${String(error)}`);
    }

    async createCard(card: { content: string, deckId: string, tags?: string[] }) {
        if (!card.deckId) {
            throw new Error("Deck ID is required to create a card");
        }
        
        // Use the standard documented endpoint: POST /api/cards/
        // Retry with exponential backoff on 429 errors
        const maxRetries = 3;
        let lastError: unknown;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Wait before retry: 1s, 2s, 4s
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                const response = await requestUrl({
                    url: `${this.baseUrl}/cards/`,
                    method: "POST",
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        content: card.content,
                        "deck-id": card.deckId,
                        "manual-tags": card.tags || []
                    })
                });
                
                if (response.status >= 200 && response.status < 300) {
                    return response.json as { id?: string; _id?: string; cardId?: string; card?: { id: string } };
                }
                
                // If 429 and not last attempt, retry
                if (response.status === 429 && attempt < maxRetries) {
                    lastError = { status: 429, text: response.text, message: `Rate limited (429)` };
                    continue;
                }
                
                // For non-429 errors or 429 on last attempt, throw
                throw new Error(`Create card failed: ${response.status} - ${response.text || 'Unknown error'}`);
            } catch (error: unknown) {
                // Check if it's a 429 error and we can retry
                if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429 && attempt < maxRetries) {
                    lastError = error;
                    continue;
                }
                this.handleError(error, "Create card");
            }
        }
        
        // If we exhausted retries, throw the last error
        this.handleError(lastError, "Create card");
    }

    async updateCard(cardId: string, card: { content: string, tags?: string[] }) {
        // Retry with exponential backoff on 429 errors
        const maxRetries = 3;
        let lastError: unknown;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Wait before retry: 1s, 2s, 4s
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                // Try PUT first (standard REST), fallback to POST if needed
                let response;
                try {
                    response = await requestUrl({
                        url: `${this.baseUrl}/cards/${cardId}`,
                        method: "PUT",
                        headers: this.getHeaders(),
                        body: JSON.stringify({
                            content: card.content,
                            "manual-tags": card.tags || []
                        })
                    });
                } catch {
                    // Fallback to POST if PUT is not supported
                    response = await requestUrl({
                        url: `${this.baseUrl}/cards/${cardId}`,
                        method: "POST",
                        headers: this.getHeaders(),
                        body: JSON.stringify({
                            content: card.content,
                            "manual-tags": card.tags || []
                        })
                    });
                }
                
                if (response.status >= 200 && response.status < 300) {
                    return response.json as { id?: string; _id?: string; cardId?: string; card?: { id: string } };
                }
                
                // If 429 and not last attempt, retry
                if (response.status === 429 && attempt < maxRetries) {
                    lastError = { status: 429, text: response.text, message: `Rate limited (429)` };
                    continue;
                }
                
                // For non-429 errors or 429 on last attempt, throw
                throw new Error(`Update card failed: ${response.status} - ${response.text || 'Unknown error'}`);
            } catch (error: unknown) {
                // Check if it's a 429 error and we can retry
                if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429 && attempt < maxRetries) {
                    lastError = error;
                    continue;
                }
                this.handleError(error, "Update card");
            }
        }
        
        // If we exhausted retries, throw the last error
        this.handleError(lastError, "Update card");
    }

    async listDecks(): Promise<{id: string, name: string}[]> {
        try {
            const res = await requestUrl({
                url: `${this.baseUrl}/decks`,
                method: "GET",
                headers: this.getHeaders()
            });
            const json = res.json as { docs?: {id: string, name: string}[] };
            return json.docs || [];
        } catch (error: unknown) {
            this.handleError(error, "List decks");
            return [];
        }
    }

    /**
     * Test API connection by listing decks
     * Returns true if connection is successful, false otherwise
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const decks = await this.listDecks();
            return {
                success: true,
                message: `API connection successful. Found ${decks.length} deck(s).`
            };
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `API connection failed: ${errorMsg}. Please check your API key and network connection.`
            };
        }
    }
}

