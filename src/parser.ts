import { MochiCardBlock } from "./types";
import { TFile } from "obsidian";

export interface ParseResult {
    cards: MochiCardBlock[];
    fileUpdates: Map<TFile, string>; // File -> updated content
}

export class CardParser {
    // Matches all ```mochi code blocks (with or without IDs)
    private static readonly CARD_BLOCK_REGEX = /```mochi\s*\n([\s\S]*?)```/g;
    
    // Extract question, answer, tags, and deck from card body
    private static readonly Q_REGEX = /^\s*Q:\s*([\s\S]*?)(?=^\s*A:|^\s*Tags:|^\s*Deck:|$)/m;
    private static readonly A_REGEX = /^\s*A:\s*([\s\S]*?)(?=^\s*Tags:|^\s*Deck:|$)/m;
    private static readonly TAGS_REGEX = /^\s*Tags:\s*(.*)$/m;
    private static readonly DECK_REGEX = /^\s*Deck:\s*(.*)$/m;

    private static generateId(): string {
        return crypto.randomUUID().slice(0, 8);
    }

    static parseFile(fileContent: string, file: TFile): ParseResult {
        const cards: MochiCardBlock[] = [];
        let updatedContent = fileContent;
        const replacements: Array<{ start: number, end: number, replacement: string }> = [];

        // Find all ```mochi code blocks (with or without IDs)
        this.CARD_BLOCK_REGEX.lastIndex = 0;
        let match;
        while ((match = this.CARD_BLOCK_REGEX.exec(fileContent)) !== null) {
            const blockStart = match.index;
            const blockEnd = blockStart + match[0].length;
            const body = match[1];
            
            // Check if this block has an ID by looking for %% id:... %% pattern
            if (!body) continue;
            
            const idMatch = /^\s*%%\s*id:([\w-]+)\s*%%\s*\n/.exec(body);
            let cardId: string;
            let newBlock: string;

            if (idMatch && idMatch[1]) {
                // Block already has an ID
                cardId = idMatch[1];
                newBlock = match[0]; // Keep original block
            } else {
                // Block needs an ID - generate one
                cardId = this.generateId();
                const idLine = `%% id:${cardId} %%\n`;
                // Insert ID line after ```mochi\n
                newBlock = match[0].replace(/```mochi\s*\n/, `\`\`\`mochi\n${idLine}`);
                replacements.push({ start: blockStart, end: blockEnd, replacement: newBlock });
            }

            // Parse card content (body without ID line if present)
            const bodyWithoutId = idMatch ? body.substring(idMatch[0].length) : body;
            const qMatch = this.Q_REGEX.exec(bodyWithoutId);
            const aMatch = this.A_REGEX.exec(bodyWithoutId);
            const tagsMatch = this.TAGS_REGEX.exec(bodyWithoutId);
            const deckMatch = this.DECK_REGEX.exec(bodyWithoutId);

            // Card must have both question and answer
            if (qMatch && qMatch[1] && aMatch && aMatch[1]) {
                cards.push({
                    id: cardId.trim(),
                    question: qMatch[1].trim(),
                    answer: aMatch[1].trim(),
                    tags: tagsMatch && tagsMatch[1] ? tagsMatch[1].split(',').map(t => t.trim()).filter(t => t) : [],
                    deck: deckMatch && deckMatch[1] ? deckMatch[1].trim() : undefined,
                    filePath: file.path,
                    originalContent: newBlock
                });
            }
        }

        // Apply replacements in reverse order to maintain positions
        if (replacements.length > 0) {
            replacements.sort((a, b) => b.start - a.start);
            for (const rep of replacements) {
                updatedContent = updatedContent.substring(0, rep.start) + rep.replacement + updatedContent.substring(rep.end);
            }
        }

        const fileUpdates = new Map<TFile, string>();
        if (replacements.length > 0) {
            fileUpdates.set(file, updatedContent);
        }

        return { cards, fileUpdates };
    }
}
