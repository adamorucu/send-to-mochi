import {App, PluginSettingTab, Setting} from "obsidian";
import SamplePlugin from "./main";

export interface SamplePluginSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: SamplePluginSettings = {
	mySetting: 'default'
}

export class SamplePluginSettingTab extends PluginSettingTab {
	plugin: SamplePlugin;

	constructor(app: App, plugin: SamplePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
