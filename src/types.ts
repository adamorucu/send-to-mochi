export type CardType = "qa" | "cloze";

export interface MochiCardBlock {
    id: string; // The local unique ID
    type: CardType;
    // For Q&A cards
    question?: string;
    answer?: string;
    // For cloze cards
    content?: string;
    deck?: string;
    tags: string[];
    filePath: string; // Where we found it
    originalContent: string; // For hashing
}

export interface SyncState {
    cards: {
        [localId: string]: {
            mochiId: string; // The ID in Mochi's system
            contentHash: string;
            lastSync: number;
        }
    };
    decks: {
        [name: string]: string; // Name -> Mochi Deck ID mapping
    }
}

export interface PluginSettings {
    apiKey: string;
    defaultDeckId: string;
}
