import { App, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { Sector } from './types';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';

function offsetDate(isoDate: string, days: number): string {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

const BLOCK_REGEX = /```sectograph\n([\s\S]*?)```/;

interface DailyNotesConfig {
    folder: string;   // e.g. "Daily Notes" or ""  
    format: string;   // moment.js format, e.g. "YYYY-MM-DD"  
}

export class SectorStore {
    constructor(private app: App) { }

    // ── Daily Notes config ────────────────────────────────────────────────────  

    private getDailyNotesConfig(): DailyNotesConfig {
        const { folder, format } = getDailyNoteSettings();
        return { folder: folder ?? '', format: format ?? 'YYYY-MM-DD' };
    }

    async getDailyNotePath(date: string): Promise<string> {
        const cfg = await this.getDailyNotesConfig();
        // moment is available globally in Obsidian  
        const formatted = (window as any).moment(date, 'YYYY-MM-DD').format(cfg.format);
        const prefix = cfg.folder ? cfg.folder.replace(/\/$/, '') + '/' : '';
        return `${prefix}${formatted}.md`;
    }

    // ── File helpers ──────────────────────────────────────────────────────────  

    private async ensureFolder(path: string): Promise<void> {
        if (!path || this.app.vault.getAbstractFileByPath(path)) return;
        await this.app.vault.createFolder(path);
    }

    private async getOrCreateFile(path: string): Promise<TFile> {
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
            const parts = path.split('/');
            if (parts.length > 1) {
                await this.ensureFolder(parts.slice(0, -1).join('/'));
            }
            await this.app.vault.create(path, '');
            file = this.app.vault.getAbstractFileByPath(path);
        }
        return file as TFile;
    }

    private async readBlock(file: TFile): Promise<Sector[]> {
        const raw = await this.app.vault.read(file);
        const match = raw.match(BLOCK_REGEX);
        if (!match) return [];
        return (parseYaml(match[1]) as Sector[]) ?? [];
    }

    private async readForDate(isoDate: string): Promise<Sector[]> {
        const path = await this.getDailyNotePath(isoDate);
        const file = this.app.vault.getAbstractFileByPath(path);
        return (file instanceof TFile) ? await this.readBlock(file) : [];
    }

    private async writeBlock(file: TFile, sectors: Sector[]): Promise<void> {
        const raw = await this.app.vault.read(file);
        const block = '```sectograph\n' + stringifyYaml(sectors) + '```';
        const updated = BLOCK_REGEX.test(raw)
            ? raw.replace(BLOCK_REGEX, block)
            : raw + (raw.length > 0 ? '\n\n' : '') + block;
        await this.app.vault.modify(file, updated);
    }

    // ── Day-specific sectors (stored in daily notes) ──────────────────────────  

    async loadForDate(isoDate: string): Promise<Sector[]> {
        // Load sectors for this specific date  
        const path = await this.getDailyNotePath(isoDate);
        const file = this.app.vault.getAbstractFileByPath(path);
        const sectors = await this.readForDate(isoDate);  

        // Load sectors from the previous day to find midnight-crossing overflow  
        const prevDate = offsetDate(isoDate, -1);
        const prevPath = await this.getDailyNotePath(prevDate);
        const prevFile = this.app.vault.getAbstractFileByPath(prevPath);
        const prevSectors = await this.readForDate(prevDate);

        // Inject the post-midnight half of any midnight-crossing sector from day N-1  
        const overflow = prevSectors
            .filter(s => {
                const [sh, sm] = s.start.split(':').map(Number);
                const [eh, em] = s.end.split(':').map(Number);
                return (eh * 60 + em) < (sh * 60 + sm) && (eh * 60 + em) !== 0;
            })
            .map(s => ({ ...s, start: '00:00' }));

        return [...sectors, ...overflow];
    }

    async saveForDate(date: string, sectors: Sector[]): Promise<void> {
        const path = await this.getDailyNotePath(date);
        const file = await this.getOrCreateFile(path);
        await this.writeBlock(file, sectors);
    }

    // ── Repeating sectors (stored in Sectograph/repeating.md) ─────────────────  

    private readonly REPEATING_PATH = 'Sectograph/repeating.md';

    async loadRepeating(): Promise<Sector[]> {
        const file = this.app.vault.getAbstractFileByPath(this.REPEATING_PATH);
        if (!(file instanceof TFile)) return [];
        return this.readBlock(file);
    }

    async saveRepeating(sectors: Sector[]): Promise<void> {
        const file = await this.getOrCreateFile(this.REPEATING_PATH);
        await this.writeBlock(file, sectors);
    }

    // ── Combined load (day-specific + matching repeating) ─────────────────────  

    async load(date: string): Promise<Sector[]> {
        const [daySpecific, repeating] = await Promise.all([
            this.loadForDate(date),
            this.loadRepeating(),
        ]);
        const weekday = (window as any).moment(date, 'YYYY-MM-DD').day(); // 0=Sun…6=Sat  
        const active = repeating.filter(s => s.days && s.days.includes(weekday));
        return [...daySpecific, ...active];
    }


    // ── Add a sector ──────────────────────────────────────────────────────────  

    async addSector(sector: Sector): Promise<void> {
        if (sector.days && sector.days.length > 0) {
            // Repeating — goes into repeating.md  
            const existing = await this.loadRepeating();
            existing.push(sector);
            await this.saveRepeating(existing);
        } else {
            // One-time — goes into the daily note for its date  
            const date = sector.date ?? new Date().toISOString().slice(0, 10);
            const existing = await this.readForDate(date);
            existing.push(sector);
            await this.saveForDate(date, existing);
        }
    }

    // ── Migration from old single-file format ─────────────────────────────────  

    async migrateFromSingleFile(oldPath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(oldPath);
        if (!(file instanceof TFile)) return;

        const sectors = await this.readBlock(file);
        if (sectors.length === 0) return;

        const today = new Date().toISOString().slice(0, 10);
        const byDate: Record<string, Sector[]> = {};
        const repeating: Sector[] = [];

        for (const s of sectors) {
            if (s.days && s.days.length > 0) {
                repeating.push(s);
            } else {
                const date = s.date ?? today;
                (byDate[date] ??= []).push(s);
            }
        }

        await Promise.all([
            ...Object.entries(byDate).map(([date, ss]) => this.saveForDate(date, ss)),
            repeating.length > 0 ? this.saveRepeating(repeating) : Promise.resolve(),
        ]);
    }
}