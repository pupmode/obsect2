import { App, Modal, Notice, Setting } from 'obsidian';
import SectographPlugin from './main';
import { Sector } from './types';
import { COLORS } from './renderClock';
import { organizeTimeframe } from './timeframeOrganizer';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export class AddSectorModal extends Modal {
    private title = '';
    private start = '';
    private end = '';
    private days: number[] = [];
    private timeframe: 'morning' | 'afternoon' | 'evening' | 'night' | '' = '';
    private duration = 60;
    private autoOrganize = true;

    constructor(app: App, private plugin: SectographPlugin) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Add sector' });

        new Setting(contentEl)
            .setName('Title')
            .addText(t => t.onChange(v => this.title = v));

        // ── Timeframe dropdown ────────────────────────────────────────────────  
        new Setting(contentEl)
            .setName('Timeframe')
            .setDesc('Pick a timeframe for auto-organization, or leave as "None" to set times manually.')
            .addDropdown(drop => drop
                .addOption('', 'None')
                .addOption('morning', 'Morning')
                .addOption('afternoon', 'Afternoon')
                .addOption('evening', 'Evening')
                .addOption('night', 'Night')
                .setValue('')
                .onChange(v => {
                    this.timeframe = v as any;
                    startSetting.settingEl.style.display = v ? 'none' : '';
                    endSetting.settingEl.style.display = v ? 'none' : '';
                    durationSetting.settingEl.style.display = v ? '' : 'none';
                }));

        // ── Manual time fields (visible when no timeframe) ────────────────────  
        const startSetting = new Setting(contentEl)
            .setName('Start time').setDesc('HH:MM')
            .addText(t => t.setPlaceholder('09:00').onChange(v => this.start = v));

        const endSetting = new Setting(contentEl)
            .setName('End time').setDesc('HH:MM')
            .addText(t => t.setPlaceholder('11:00').onChange(v => this.end = v));

        // ── Duration (visible when timeframe is selected) ─────────────────────  
        const durationSetting = new Setting(contentEl)
            .setName('Duration')
            .addDropdown(drop => drop
                .addOption('30', '30 minutes')
                .addOption('60', '1 hour')
                .addOption('custom', 'Custom')
                .setValue('60')
                .onChange(v => {
                    if (v !== 'custom') {
                        this.duration = parseInt(v);
                        customInput.style.display = 'none';
                    } else {
                        customInput.style.display = '';
                    }
                }));

        const customInput = durationSetting.controlEl.createEl('input', { type: 'number' }) as HTMLInputElement;
        customInput.placeholder = 'minutes';
        customInput.style.cssText = 'display:none; width:70px; margin-left:8px;';
        customInput.addEventListener('change', () => {
            this.duration = parseInt(customInput.value) || 60;
        });

        // ── Auto-organize toggle (visible when timeframe is selected) ─────────  
        const autoOrgSetting = new Setting(contentEl)
            .setName('Auto-organize')
            .setDesc('Include in auto-organization. When unchecked, other sectors will organize around this one.')
            .addToggle(t => t.setValue(true).onChange(v => this.autoOrganize = v));

        autoOrgSetting.settingEl.style.display = 'none';

        // ── Repeat days ───────────────────────────────────────────────────────  
        const daySetting = new Setting(contentEl)
            .setName('Repeat on days')
            .setDesc('Leave all unchecked for a one-time event on today\'s date.');

        const dayRow = daySetting.controlEl.createEl('div', { cls: 'sectograph-day-row' });
        DAY_LABELS.forEach((label, i) => {
            const wrapper = dayRow.createEl('label', { cls: 'sectograph-day-label' });
            const cb = wrapper.createEl('input', { type: 'checkbox' });
            cb.addEventListener('change', () => {
                this.days = cb.checked ? [...this.days, i] : this.days.filter(d => d !== i);
            });
            wrapper.appendText(label);
        });

        // ── Add button ────────────────────────────────────────────────────────  
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Add')
                .setCta()
                .onClick(async () => {
                    if (!this.title) return;

                    const today = new Date().toISOString().slice(0, 10);
                    const sector: Sector = {
                        title: this.title,
                        start: this.timeframe ? undefined : (this.start || undefined),
                        end: this.timeframe ? undefined : (this.end || undefined),
                        date: today,
                        days: this.days,
                        color: COLORS[Math.floor(Math.random() * COLORS.length)],
                        timeframe: this.timeframe || undefined,
                        duration: this.timeframe ? this.duration : undefined,
                        autoOrganize: this.autoOrganize,
                    };

                    await this.plugin.store.addSector(sector);

                    if (this.timeframe) {
                        const allSectors = await this.plugin.store.load(today);
                        const result = organizeTimeframe(allSectors, this.timeframe, this.plugin.settings);
                        if (result.warning) {
                            // Roll back — find and delete the sector we just added  
                            const justAdded = allSectors.find(
                                s => s.title === this.title && !s.start && s.timeframe === this.timeframe
                            );
                            if (justAdded?.id) await this.plugin.store.deleteSector(justAdded.id);
                            new Notice(result.warning);
                            return;
                        }
                        for (const s of result.updated) {
                            if (s.id) await this.plugin.store.updateSector(s.id, s);
                        }
                    }

                    this.plugin.reloadClockView();
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}