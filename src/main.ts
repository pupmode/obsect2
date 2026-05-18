import { Plugin, WorkspaceLeaf, parseYaml } from 'obsidian';
import { DEFAULT_SETTINGS, SectographSettings, SectographSettingTab } from './settings';
import { ClockView, VIEW_TYPE_CLOCK } from './ClockView';
import { AddSectorModal } from './AddSectorModal';
import { SectorStore } from './SectorStore';

export default class Sectograph extends Plugin {
	settings: SectographSettings;
	store: SectorStore;

	async onload() {
		await this.loadSettings();

		this.store = new SectorStore(
			this.app
		);

		// Migrate from old single-file format on first load  
		if (!this.settings.migrated) {
			await this.store.migrateFromSingleFile(this.settings.sourceNotePath);
			this.settings.migrated = true;
			await this.saveSettings();
		}

		// 1. Register the clock view type  
		this.registerView(VIEW_TYPE_CLOCK, (leaf: WorkspaceLeaf) => new ClockView(leaf, this));

		// 2. Open in right sidebar once workspace is ready  
		this.app.workspace.onLayoutReady(async () => {
			await this.activateView();
		});

		// 3. Command to reopen the clock if the user closes it  
		this.addCommand({
			id: 'open-sectograph',
			name: 'Open Sectograph clock',
			callback: async () => {
				await this.activateView();
			}
		});

		// 4. Command to add a new sector  
		this.addCommand({
			id: 'add-sector',
			name: 'Add sector',
			callback: () => {
				new AddSectorModal(this.app, this).open();
			}
		});

		// 5. Render sectograph code blocks inside notes  
		this.registerMarkdownCodeBlockProcessor('sectograph', (source, el, _ctx) => {
			const sectors = parseYaml(source) ?? [];
			el.createEl('pre', { text: JSON.stringify(sectors, null, 2) });
		});

		// 6. Redraw the clock hand every minute  
		this.registerInterval(window.setInterval(() => {
			this.refreshClockView();
		}, 60 * 1000));

		// 7. Settings tab  
		this.addSettingTab(new SectographSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CLOCK);
	}

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLOCK);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		await leaf?.setViewState({ type: VIEW_TYPE_CLOCK, active: true });
		if (leaf) this.app.workspace.revealLeaf(leaf);
	}

	refreshClockView() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CLOCK)) {
			if (leaf.view instanceof ClockView) {
				leaf.view.redrawHand();
			}
		}
	}
	reloadClockView() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CLOCK)) {
			if (leaf.view instanceof ClockView) {
				leaf.view.render();
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<SectographSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}