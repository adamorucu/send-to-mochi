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

    private handleError(error: any, operation: string): never {
        if (error?.status) {
            throw new Error(`${operation} failed: ${error.status} - ${error.text || error.message || 'Unknown error'}`);
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
        
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/cards`,
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    content: card.content,
                    "deck-id": card.deckId,
                    "manual-tags": card.tags || []
                })
            });
            
            if (response.status >= 200 && response.status < 300) {
                return response.json;
            }
            throw new Error(`Create card failed: ${response.status} - ${response.text || 'Unknown error'}`);
        } catch (error: any) {
            this.handleError(error, "Create card");
        }
    }

    async updateCard(cardId: string, card: { content: string, tags?: string[] }) {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/cards/${cardId}`,
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    content: card.content,
                    "manual-tags": card.tags || []
                })
            });
            
            if (response.status >= 200 && response.status < 300) {
                return response.json;
            }
            throw new Error(`Update card failed: ${response.status} - ${response.text || 'Unknown error'}`);
        } catch (error: any) {
            this.handleError(error, "Update card");
        }
    }

    async listDecks(): Promise<{id: string, name: string}[]> {
        const res = await requestUrl({
            url: `${this.baseUrl}/decks`,
            method: "GET",
            headers: this.getHeaders()
        });
        return res.json.docs || [];
    }
}

