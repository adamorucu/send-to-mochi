import { App, Plugin, PluginSettingTab, Setting, Editor } from "obsidian";
import { MochiClient } from "./src/mochi-api";
import { SyncEngine } from "./src/sync-engine";
import { SyncState, PluginSettings } from "./src/types";

const DEFAULT_SETTINGS: PluginSettings = {
    apiKey: "",
    defaultDeckId: ""
};

export default class MochiSyncPlugin extends Plugin {
    settings: PluginSettings;
    syncState: SyncState = { cards: {}, decks: {} };
    client: MochiClient;
    engine: SyncEngine;

    async onload() {
        await this.loadSettings();
        await this.loadSyncState();

        this.client = new MochiClient(this.settings.apiKey);
        this.engine = new SyncEngine(
            this.app, 
            this.client, 
            this.settings,
            () => this.syncState,
            async (s) => this.saveSyncState(s)
        );

        // Command: Trigger Sync
        this.addCommand({
            id: 'sync-mochi-cards',
            name: 'Sync cards to Mochi',
            callback: () => this.engine.runSync()
        });

        // Command: Insert Card Template
        this.addCommand({
            id: 'insert-mochi-card',
            name: 'Insert new Mochi card',
            editorCallback: (editor: Editor) => {
                const id = crypto.randomUUID().slice(0, 8); // Short random ID
                const template = `\n\`\`\`mochi\n%% id:${id} %%\nQ: \nA: \n\`\`\`\n`;
                editor.replaceSelection(template);
            }
        });

        this.addSettingTab(new MochiSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings); // Note: Should separate settings from sync state in prod
    }

    async loadSyncState() {
        // In this simple version, we store state in the same file as settings.
        // In prod, consider using a separate file adapter.
        const data = await this.loadData();
        if (data && data.syncState) {
            this.syncState = data.syncState;
        }
    }

    async saveSyncState(state: SyncState) {
        this.syncState = state;
        
        // Load existing data and merge with sync state
        const existingData = await this.loadData() || {};
        const data = {
            ...existingData,
            syncState: state
        };
        
        await this.saveData(data);
    }
}

class MochiSettingTab extends PluginSettingTab {
    plugin: MochiSyncPlugin;

    constructor(app: App, plugin: MochiSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('API Key')
            .addText(text => text
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                    // Re-init client
                    this.plugin.client = new MochiClient(value);
                }));

        new Setting(containerEl)
            .setName('Default Deck ID')
            .addText(text => text
                .setValue(this.plugin.settings.defaultDeckId)
                .onChange(async (value) => {
                    this.plugin.settings.defaultDeckId = value;
                    await this.plugin.saveSettings();
                }));
    }
}
