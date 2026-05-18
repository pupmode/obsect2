import { App, PluginSettingTab, Setting } from 'obsidian';
import SectographPlugin from './main';

export interface SectographSettings {
	defaultView: '12h' | '24h';
}

export const DEFAULT_SETTINGS: SectographSettings = {
	defaultView: '12h',
};

export class SectographSettingTab extends PluginSettingTab {
	plugin: SectographPlugin;

	constructor(app: App, plugin: SectographPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Default clock view')
			.setDesc('Whether the clock opens in 12-hour or 24-hour mode by default.')
			.addDropdown(drop => drop
				.addOption('12h', '12-hour')
				.addOption('24h', '24-hour')
				.setValue(this.plugin.settings.defaultView)
				.onChange(async (value) => {
					this.plugin.settings.defaultView = value as '12h' | '24h';
					await this.plugin.saveSettings();
				}));
	}
}