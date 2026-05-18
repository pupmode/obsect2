import { App, PluginSettingTab, Setting } from 'obsidian';
import SectographPlugin from './main';

// ── NEW: timeframe boundary type ─────────────────────────────────────────────  
export interface TimeframeBounds {
	start: string;   // "HH:MM"  
	end: string;     // "HH:MM"  
}

export interface SectographSettings {
	sourceNotePath: string;
	defaultView: '12h' | '24h';
	migrated: boolean;
	// ── NEW ──────────────────────────────────────────────────────────────────  
	timeframes: {
		morning: TimeframeBounds;
		afternoon: TimeframeBounds;
		evening: TimeframeBounds;
		night: TimeframeBounds;
	};
}

export const DEFAULT_SETTINGS: SectographSettings = {
	sourceNotePath: 'Sectograph.md',
	defaultView: '12h',
	migrated: false,
	// ── NEW ──────────────────────────────────────────────────────────────────  
	timeframes: {
		morning: { start: '05:00', end: '12:00' },
		afternoon: { start: '12:00', end: '17:00' },
		evening: { start: '17:00', end: '00:00' },
		night: { start: '00:00', end: '05:00' },
	},
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

		// ── UNCHANGED ────────────────────────────────────────────────────────  
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

		// ── NEW: timeframe boundaries ─────────────────────────────────────────  
		containerEl.createEl('h3', { text: 'Timeframe boundaries' });
		containerEl.createEl('p', {
			text: 'Set the start and end of each timeframe. Timeframes should not overlap.',
			cls: 'setting-item-description',
		});

		const TIMEFRAMES = [
			{ key: 'morning', label: 'Morning' },
			{ key: 'afternoon', label: 'Afternoon' },
			{ key: 'evening', label: 'Evening' },
			{ key: 'night', label: 'Night' },
		] as const;

		for (const { key, label } of TIMEFRAMES) {
			new Setting(containerEl)
				.setName(label)
				.setDesc(`Start and end time for "${label.toLowerCase()}" (HH:MM).`)
				.addText(text => text
					.setPlaceholder('HH:MM')
					.setValue(this.plugin.settings.timeframes[key].start)
					.onChange(async (value) => {
						this.plugin.settings.timeframes[key].start = value;
						await this.plugin.saveSettings();
					}))
				.addText(text => text
					.setPlaceholder('HH:MM')
					.setValue(this.plugin.settings.timeframes[key].end)
					.onChange(async (value) => {
						this.plugin.settings.timeframes[key].end = value;
						await this.plugin.saveSettings();
					}));
		}
	}
}