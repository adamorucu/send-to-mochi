import {App, PluginSettingTab, Setting} from "obsidian";
import SendToMochiPlugin from "./main";
import {PluginSettings} from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultDeckId: ''
}

export class SendToMochiSettingTab extends PluginSettingTab {
	plugin: SendToMochiPlugin;

	constructor(app: App, plugin: SendToMochiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Mochi API')
			.setHeading();

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Your authentication key for the mochi service.')
			.addText(text => {
				text.setPlaceholder('Enter your API key')
					.setValue(this.plugin.settings.apiKey)
					.inputEl.type = 'password';
				text.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Default deck ID')
			.setDesc('The default deck where new cards will be created.')
			.addText(text => text
				.setPlaceholder('Enter default deck ID')
				.setValue(this.plugin.settings.defaultDeckId)
				.onChange(async (value) => {
					this.plugin.settings.defaultDeckId = value;
					await this.plugin.saveSettings();
				}));
	}
}
