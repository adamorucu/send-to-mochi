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
        
        // First, verify the deck exists by trying to fetch it
        try {
            const decks = await this.listDecks();
            const deckExists = decks.some(d => d.id === card.deckId);
            if (!deckExists) {
                throw new Error(`Deck with ID "${card.deckId}" not found. Available decks: ${decks.map(d => `${d.name} (${d.id})`).join(', ') || 'none'}`);
            }
        } catch (error: unknown) {
            // If listing decks fails, log but continue - might be a different issue
            console.warn("Could not verify deck existence:", error);
        }
        
        // Try multiple endpoint patterns and field name variations
        // Based on Mochi API documentation, the endpoint should be POST /api/cards/
        const endpoints = [
            // Pattern 1: Top-level cards with trailing slash and deck-id (documented format)
            { url: `${this.baseUrl}/cards/`, body: { content: card.content, "deck-id": card.deckId, "manual-tags": card.tags || [] } },
            // Pattern 2: Try with /v1 version (some APIs use versioning)
            { url: `${this.baseUrl}/v1/cards/`, body: { content: card.content, "deck-id": card.deckId, "manual-tags": card.tags || [] } },
            // Pattern 3: Top-level cards without trailing slash
            { url: `${this.baseUrl}/cards`, body: { content: card.content, "deck-id": card.deckId, "manual-tags": card.tags || [] } },
            // Pattern 4: Deck-specific endpoint (RESTful)
            { url: `${this.baseUrl}/decks/${card.deckId}/cards`, body: { content: card.content, "manual-tags": card.tags || [] } },
            // Pattern 5: Deck-specific endpoint with trailing slash
            { url: `${this.baseUrl}/decks/${card.deckId}/cards/`, body: { content: card.content, "manual-tags": card.tags || [] } },
            // Pattern 6: Try with deckId (camelCase) instead of deck-id
            { url: `${this.baseUrl}/cards/`, body: { content: card.content, deckId: card.deckId, tags: card.tags || [] } },
            // Pattern 7: Try with deck_id (snake_case)
            { url: `${this.baseUrl}/cards/`, body: { content: card.content, deck_id: card.deckId, tags: card.tags || [] } },
            // Pattern 8: Try with deck field name
            { url: `${this.baseUrl}/cards/`, body: { content: card.content, deck: card.deckId, tags: card.tags || [] } },
        ];
        
        let lastError: unknown;
        const attemptedUrls: string[] = [];
        for (const endpoint of endpoints) {
            attemptedUrls.push(endpoint.url);
            try {
                const response = await requestUrl({
                    url: endpoint.url,
                    method: "POST",
                    headers: this.getHeaders(),
                    body: JSON.stringify(endpoint.body)
                });
                
                if (response.status >= 200 && response.status < 300) {
                    return response.json as { id?: string; _id?: string; cardId?: string; card?: { id: string } };
                }
                
                // Log the response for debugging
                console.debug(`Attempted ${endpoint.url} with body:`, endpoint.body);
                console.debug(`Response status: ${response.status}, body:`, response.text);
                
                lastError = { 
                    status: response.status, 
                    text: response.text, 
                    message: `Status ${response.status}: ${response.text || 'Unknown error'}`,
                    url: endpoint.url 
                };
            } catch (error: unknown) {
                // Add URL info to error if it's a status error
                if (error && typeof error === 'object' && 'status' in error) {
                    (error as { url?: string }).url = endpoint.url;
                    // Try to extract response text if available
                    if ('text' in error) {
                        console.debug(`Error response from ${endpoint.url}:`, (error as { text?: string }).text);
                    }
                }
                lastError = error;
                // Continue to next endpoint
                continue;
            }
        }
        
        // If all endpoints failed, provide helpful error message
        const urlsInfo = attemptedUrls.length > 0 ? ` (Tried: ${attemptedUrls.join(', ')})` : '';
        let errorMessage = "Create card failed";
        
        if (lastError && typeof lastError === 'object') {
            if ('status' in lastError && (lastError as { status: number }).status === 404) {
                errorMessage += `: 404 - The card creation endpoint was not found${urlsInfo}. `;
                errorMessage += `This may indicate that the Mochi API structure has changed. `;
                errorMessage += `Please verify: 1) Your deck ID "${card.deckId}" is correct, 2) Your API key has permission to create cards, 3) Check the Mochi API documentation for the current endpoint structure.`;
            } else if ('message' in lastError && typeof (lastError as { message: unknown }).message === 'string') {
                errorMessage = (lastError as { message: string }).message + urlsInfo;
            } else {
                const errorStr = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
                errorMessage += `: ${errorStr}${urlsInfo}`;
            }
        } else {
            let errorStr: string;
            if (lastError instanceof Error) {
                errorStr = lastError.message;
            } else if (lastError === null || lastError === undefined) {
                errorStr = 'Unknown error';
            } else if (typeof lastError === 'string') {
                errorStr = lastError;
            } else {
                errorStr = JSON.stringify(lastError);
            }
            errorMessage += `: ${errorStr}${urlsInfo}`;
        }
        
        throw new Error(errorMessage);
    }

    async updateCard(cardId: string, card: { content: string, tags?: string[] }) {
        try {
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
            throw new Error(`Update card failed: ${response.status} - ${response.text || 'Unknown error'}`);
        } catch (error: unknown) {
            this.handleError(error, "Update card");
        }
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

