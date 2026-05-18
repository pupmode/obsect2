import { App, TFile, stringifyYaml, parseYaml } from 'obsidian';
import { Sector } from './types';

const SECTORS_FOLDER = 'Sectograph/sectors';

export class SectorStore {
    constructor(private app: App) { }

    // ── Path helpers ──────────────────────────────────────────────────────────  

    private sectorPath(id: string): string {
        return `${SECTORS_FOLDER}/${id}.md`;
    }

    private generateId(sector: Sector): string {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const hh = String(now.getHours()).padStart(2, '0');
        const MM = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${dd}-${mm}-${yy}-${hh}-${MM}-${ss}`;
        const slug = sector.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        return `${timestamp}-${slug}`;
    }

    // ── File helpers ──────────────────────────────────────────────────────────  

    private async ensureFolder(): Promise<void> {
        if (!this.app.vault.getAbstractFileByPath(SECTORS_FOLDER)) {
            await this.app.vault.createFolder(SECTORS_FOLDER);
        }
    }

    private async readSector(file: TFile): Promise<Sector> {
        const raw = await this.app.vault.read(file);
        const match = raw.match(/^---\n([\s\S]*?)\n---/);
        const data = match ? (parseYaml(match[1]) as Sector) : {} as Sector;
        const id = file.basename;
        return { ...data, id };
    }

    private async writeSector(id: string, sector: Sector): Promise<void> {
        await this.ensureFolder();
        const { id: _id, ...data } = sector;   // strip id from frontmatter  
        const content = '---\n' + stringifyYaml(data) + '---\n';
        const path = this.sectorPath(id);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(path, content);
        }
    }

    // ── Load ──────────────────────────────────────────────────────────────────  

    async loadAll(): Promise<Sector[]> {
        const folder = this.app.vault.getAbstractFileByPath(SECTORS_FOLDER);
        if (!folder) return [];
        return Promise.all(
            this.app.vault.getFiles()
                .filter(f => f.path.startsWith(SECTORS_FOLDER + '/') && f.extension === 'md')
                .map(f => this.readSector(f))
        );
    }

    async loadForDate(date: string): Promise<Sector[]> {
        const all = await this.loadAll();
        return all.filter(s => !s.days?.length && s.date === date);
    }

    async loadRepeating(): Promise<Sector[]> {
        const all = await this.loadAll();
        return all.filter(s => s.days && s.days.length > 0);
    }

    async load(date: string): Promise<Sector[]> {
        const all = await this.loadAll();
        const weekday = (window as any).moment(date, 'YYYY-MM-DD').day();
        return all.filter(s =>
            (!s.days?.length && s.date === date) ||
            (s.days?.length && s.days.includes(weekday))
        );
    }

    // ── Write ─────────────────────────────────────────────────────────────────  

    async addSector(sector: Sector): Promise<void> {
        const id = this.generateId(sector);
        await this.writeSector(id, { ...sector, id });
    }

    async updateSector(id: string, sector: Sector): Promise<void> {
        await this.writeSector(id, sector);
    }

    async renameSector(oldId: string, sector: Sector): Promise<string> {
        const date = sector.date ?? new Date().toISOString().slice(0, 10);
        const [yyyy, mm, dd] = date.split('-');
        const startSlug = (sector.start ?? '').replace(':', '-');
        const titleSlug = sector.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        const newId = `${dd}-${mm}-${yyyy.slice(-2)}-${startSlug}-${titleSlug}`;

        if (newId === oldId) {
            await this.writeSector(oldId, sector);
            return oldId;
        }
        await this.writeSector(newId, { ...sector, id: newId });
        await this.deleteSector(oldId);
        return newId;
    }

    async deleteSector(id: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(this.sectorPath(id));
        if (file instanceof TFile) await this.app.vault.delete(file);
    }
}