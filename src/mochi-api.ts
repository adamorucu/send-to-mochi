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
        
        // Try multiple endpoint patterns
        const endpoints = [
            // Pattern 1: Top-level cards with deck-id in body (most common)
            { url: `${this.baseUrl}/cards`, body: { content: card.content, "deck-id": card.deckId, "manual-tags": card.tags || [] } },
            // Pattern 2: Deck-specific endpoint (RESTful)
            { url: `${this.baseUrl}/decks/${card.deckId}/cards`, body: { content: card.content, "manual-tags": card.tags || [] } },
            // Pattern 3: Try with /v1 version
            { url: `${this.baseUrl}/v1/cards`, body: { content: card.content, "deck-id": card.deckId, "manual-tags": card.tags || [] } },
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
                lastError = { status: response.status, text: response.text, message: `Status ${response.status}`, url: endpoint.url };
            } catch (error: unknown) {
                // Add URL info to error if it's a status error
                if (error && typeof error === 'object' && 'status' in error) {
                    (error as { url?: string }).url = endpoint.url;
                }
                lastError = error;
                // Continue to next endpoint
                continue;
            }
        }
        
        // If all endpoints failed, include attempted URLs in error
        const urlsInfo = attemptedUrls.length > 0 ? ` (Tried: ${attemptedUrls.join(', ')})` : '';
        if (lastError && typeof lastError === 'object' && 'message' in lastError) {
            (lastError as { message: string }).message += urlsInfo;
        }
        this.handleError(lastError, "Create card");
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
            } catch (putError: unknown) {
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
        const res = await requestUrl({
            url: `${this.baseUrl}/decks`,
            method: "GET",
            headers: this.getHeaders()
        });
        const json = res.json as { docs?: {id: string, name: string}[] };
        return json.docs || [];
    }
}

