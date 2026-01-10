// src/sync-engine.ts
import { App, Notice } from "obsidian";
import { MochiClient } from "./mochi-api";
import { CardParser } from "./parser";
import { PluginSettings, SyncState } from "./types";

// Simple string hash function to detect content changes
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

export class SyncEngine {
    constructor(
        private app: App,
        private api: MochiClient,
        private settings: PluginSettings,
        private getState: () => SyncState,
        private saveState: (state: SyncState) => Promise<void>
    ) {}

    async runSync() {
        new Notice("Starting mochi sync...");
        
        // Validate settings
        if (!this.settings.apiKey) {
            new Notice("API key is not set. Please configure it in settings.", 10000);
            return;
        }
        
        if (!this.settings.defaultDeckId) {
            new Notice("Default deck is not set. Please configure it in settings.", 10000);
            return;
        }
        
        // Get all markdown files and scan for cards
        const files = this.app.vault.getMarkdownFiles();
        const state = this.getState();
        let created = 0;
        let updated = 0;
        let totalCardsFound = 0;

        // Scan each file for cards
        for (const file of files) {
            const content = await this.app.vault.read(file);
            const parseResult = CardParser.parseFile(content, file);
            const cards = parseResult.cards;
            totalCardsFound += cards.length;

            // Update files that need IDs inserted
            for (const [fileToUpdate, updatedContent] of parseResult.fileUpdates) {
                await this.app.vault.modify(fileToUpdate, updatedContent);
            }

            // Process each card
            for (const card of cards) {
                // Generate content hash based on card type
                let currentHash: string;
                let mochiContent: string;
                
                if (card.type === "cloze" && card.content) {
                    currentHash = simpleHash(card.content + card.tags.join(","));
                    mochiContent = card.content;
                } else if (card.type === "qa" && card.question && card.answer) {
                    currentHash = simpleHash(card.question + card.answer + card.tags.join(","));
                    mochiContent = `${card.question}\n---\n${card.answer}`;
                } else {
                    console.warn(`Card ${card.id} has invalid format, skipping`);
                    continue;
                }
                
                const existingState = state.cards[card.id];

                if (!existingState) {
                    // Create new card
                    try {
                        const res = await this.api.createCard({
                            content: mochiContent,
                            deckId: this.settings.defaultDeckId,
                            tags: card.tags
                        });
                        
                        const mochiId = res?.id || res?._id || res?.cardId || res?.card?.id;
                        if (!mochiId || typeof mochiId !== 'string') {
                            console.warn(`Card ${card.id} created but no ID in response`);
                            state.cards[card.id] = {
                                mochiId: 'unknown',
                                contentHash: currentHash,
                                lastSync: Date.now()
                            };
                        } else {
                            state.cards[card.id] = {
                                mochiId: mochiId,
                                contentHash: currentHash,
                                lastSync: Date.now()
                            };
                        }
                        created++;
                    } catch (e: unknown) {
                        const errorMsg = (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') 
                            ? e.message 
                            : String(e);
                        if (typeof errorMsg === 'string' && errorMsg.includes('429')) {
                            new Notice(`Rate limit (429) creating card ${card.id}. Waiting before retry...`, 5000);
                            // Wait 2 seconds before continuing to next card
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        } else if (typeof errorMsg === 'string' && errorMsg.includes('404')) {
                            new Notice(`404 Error creating card ${card.id}. Check deck ID "${this.settings.defaultDeckId}" and API endpoint.`, 10000);
                        } else {
                            new Notice(`Failed to create card ${card.id}: ${errorMsg}`, 8000);
                        }
                        console.error(`[MochiSync] Failed to create card ${card.id}:`, e);
                    }
                } else if (existingState.contentHash !== currentHash) {
                    // Update existing card if content changed
                    try {
                        await this.api.updateCard(existingState.mochiId, {
                            content: mochiContent,
                            tags: card.tags
                        });
                        existingState.contentHash = currentHash;
                        existingState.lastSync = Date.now();
                        updated++;
                    } catch (e: unknown) {
                        const errorMsg = (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') 
                            ? e.message 
                            : String(e);
                        if (typeof errorMsg === 'string' && errorMsg.includes('429')) {
                            new Notice(`Rate limit (429) updating card ${card.id}. Waiting before retry...`, 5000);
                            // Wait 2 seconds before continuing to next card
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        } else {
                            new Notice(`Failed to update card ${card.id}: ${errorMsg}`, 8000);
                        }
                        console.error(`[MochiSync] Failed to update card ${card.id}:`, e);
                    }
                }
                
                // Add delay between API calls to avoid rate limiting (500ms delay)
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Save sync state
        try {
            await this.saveState(state);
        } catch (e: unknown) {
            const errorMsg = (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') 
                ? e.message 
                : String(e);
            new Notice(`Saving sync state failed: ${errorMsg}`, 10000);
            throw e;
        }

        // Show completion message
        if (totalCardsFound === 0) {
            new Notice("Sync complete but no cards found. Use format:\n```mochi\nQuestion\n---\nAnswer\n```\nor\n```mochi\nThis is {{1::cloze}} text\n```", 10000);
        } else {
            new Notice(`Sync complete: ${created} created, ${updated} updated.`);
        }
    }
}
