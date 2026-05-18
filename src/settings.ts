import { App, PluginSettingTab, Setting } from 'obsidian';
import SectographPlugin from './main';

export interface SectographSettings {
	sourceNotePath: string;       // legacy — used only for migration  
	defaultView: '12h' | '24h';
	migrated: boolean;            // internal — true once single-file migration has run  
}

export const DEFAULT_SETTINGS: SectographSettings = {
	sourceNotePath: 'Sectograph.md',
	defaultView: '12h',
	migrated: false,
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

		new Setting(containerEl)
			.setName('Legacy source note path')
			.setDesc('Path to the old single-file note (used for one-time migration only).')
			.addText(text => text
				.setPlaceholder('Sectograph.md')
				.setValue(this.plugin.settings.sourceNotePath)
				.onChange(async (value) => {
					this.plugin.settings.sourceNotePath = value;
					await this.plugin.saveSettings();
				}));
	}
}