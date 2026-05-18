import { App, Modal, Setting } from 'obsidian';
import SectographPlugin from './main';
import { Sector } from './types';
import { COLORS } from './renderClock';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export class AddSectorModal extends Modal {
    private title = '';
    private start = '';
    private end = '';
    private days: number[] = [];

    constructor(app: App, private plugin: SectographPlugin) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Add sector' });

        new Setting(contentEl)
            .setName('Title')
            .addText(t => t.onChange(v => this.title = v));

        new Setting(contentEl)
            .setName('Start time')
            .setDesc('HH:MM')
            .addText(t => t.setPlaceholder('09:00').onChange(v => this.start = v));

        new Setting(contentEl)
            .setName('End time')
            .setDesc('HH:MM')
            .addText(t => t.setPlaceholder('11:00').onChange(v => this.end = v));

        // Day repeat checkboxes  
        const daySetting = new Setting(contentEl)
            .setName('Repeat on days')
            .setDesc('Leave all unchecked for a one-time event on today\'s date.');

        const dayRow = daySetting.controlEl.createEl('div', { cls: 'sectograph-day-row' });
        DAY_LABELS.forEach((label, i) => {
            const wrapper = dayRow.createEl('label', { cls: 'sectograph-day-label' });
            const cb = wrapper.createEl('input', { type: 'checkbox' });
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    this.days = [...this.days, i];
                } else {
                    this.days = this.days.filter(d => d !== i);
                }
            });
            wrapper.appendText(label);
        });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Add')
                .setCta()
                .onClick(async () => {
                    if (!this.title || !this.start || !this.end) return;
                    const sector: Sector = {
                        title: this.title,
                        start: this.start,
                        end: this.end,
                        date: new Date().toISOString().slice(0, 10),
                        days: this.days,
                        color: COLORS[Math.floor(Math.random() * COLORS.length)],
                    };
                    await this.plugin.store.addSector(sector);
                    this.plugin.reloadClockView();
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}