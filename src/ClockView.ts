import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import SectographPlugin from './main';
import { renderClock, updateClockHand, COLORS } from './renderClock';
import { Sector } from './types';
import { AddSectorModal } from './AddSectorModal';
import { organizeTimeframe } from './timeframeOrganizer';

export const VIEW_TYPE_CLOCK = 'sectograph-clock';

function offsetDate(isoDate: string, days: number): string {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

export class ClockView extends ItemView {
    getViewType() { return VIEW_TYPE_CLOCK; }
    getDisplayText() { return 'Sectograph'; }

    private use12h: boolean;

    constructor(leaf: WorkspaceLeaf, private plugin: SectographPlugin) {
        super(leaf);
        this.use12h = plugin.settings.defaultView === '12h';
    }

    async render() {
        const container = this.containerEl.children[1];
        container.empty();

        const btn = container.createEl('button', { cls: 'sectograph-toggle' });
        setIcon(btn, 'clock');
        btn.addEventListener('click', () => { this.use12h = !this.use12h; this.render(); });

        const addBtn = container.createEl('button', { cls: 'sectograph-add-btn' });
        setIcon(addBtn, 'plus');
        addBtn.addEventListener('click', () => { new AddSectorModal(this.app, this.plugin).open(); });

        if (this.use12h) {
            const ampmBtn = container.createEl('button', { cls: 'sectograph-toggle' });
            setIcon(ampmBtn, this.showPM ? 'sun' : 'moon');
            ampmBtn.addEventListener('click', () => { this.showPM = !this.showPM; this.render(); });
        }

        const sectors = await this.plugin.store.load(this.viewDate);

        this.cachedSectors = sectors;

        const timedSectors = sectors.filter(s => s.start && s.end);
        renderClock(container, timedSectors, this.use12h, this.showPM, this.dragAngle ?? undefined, this.plugin.settings.timeframes);
        this.svgEl = container.querySelector('svg') as SVGSVGElement;
        this.renderList(container, sectors); 
        this.setupDragEvents();
    }

    private async reloadSectors() {
        this.cachedSectors = await this.plugin.store.load(this.viewDate);
        const container = this.containerEl.children[1];
        const timedSectors = this.cachedSectors.filter(s => s.start && s.end);
        renderClock(container, timedSectors, this.use12h, this.showPM, this.dragAngle ?? undefined, this.plugin.settings.timeframes);
        this.svgEl = container.querySelector('svg') as SVGSVGElement;
        if (this.isDragging) this.setupDragEvents();
    }

    private setupDragEvents() {
        const svg = this.svgEl;
        if (!svg) return;
        const ball = svg.querySelector('#sectograph-ball') as SVGCircleElement | null;
        if (!ball) return;

        ball.style.cursor = 'grab';

        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            this.isDragging = true;
            this.prevDragAngle = this.angleFromPointer(e);
            ball.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!this.isDragging) return;
            const newAngle = this.angleFromPointer(e);
            this.detectBoundaryCrossing(this.prevDragAngle!, newAngle);
            this.prevDragAngle = newAngle;
            this.dragAngle = newAngle;

            if (this.rafId !== null) cancelAnimationFrame(this.rafId);
            this.rafId = requestAnimationFrame(() => {
                this.rafId = null;
                const container = this.containerEl.children[1];
                const timedSectors = this.cachedSectors.filter(s => s.start && s.end);
                updateClockHand(container, timedSectors, this.use12h, this.showPM, this.dragAngle ?? undefined);
                this.svgEl = container.querySelector('svg') as SVGSVGElement;
                this.setupDragEvents();
            });
        };

        const onMouseUp = () => {
            this.isDragging = false;
            if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            ball.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        ball.addEventListener('mousedown', onMouseDown);
    }

    private detectBoundaryCrossing(prevAngle: number, newAngle: number) {
        const isWrap = Math.abs(newAngle - prevAngle) > 180;
        const crossedForward = !isWrap && prevAngle < -90 && newAngle >= -90;
        const crossedBackward = !isWrap && prevAngle >= -90 && newAngle < -90;

        if (crossedForward) {
            if (!this.showPM) { this.showPM = true; }
            else { this.showPM = false; this.viewDate = offsetDate(this.viewDate, +1); }
            this.reloadSectors();
        } else if (crossedBackward) {
            if (this.showPM) { this.showPM = false; }
            else { this.showPM = true; this.viewDate = offsetDate(this.viewDate, -1); }
            this.reloadSectors();
        }
    }

    private angleFromPointer(e: MouseEvent): number {
        const svg = this.svgEl!;
        const rect = svg.getBoundingClientRect();
        const svgX = (e.clientX - rect.left) / rect.width * 200;
        const svgY = (e.clientY - rect.top) / rect.height * 200;
        return Math.atan2(svgY - 100, svgX - 100) * 180 / Math.PI;
    }

    async onOpen() { await this.render(); }
    async onClose() { }

    redrawHand() {
        if (this.isDragging) return;
        const container = this.containerEl.children[1];
        const timedSectors = this.cachedSectors.filter(s => s.start && s.end);
        updateClockHand(container, timedSectors, this.use12h, this.showPM);
        this.svgEl = container.querySelector('svg') as SVGSVGElement;
        this.setupDragEvents();
    }

    private viewDate: string = new Date().toISOString().slice(0, 10);
    private showPM: boolean = new Date().getHours() >= 12;
    private isDragging = false;
    private dragAngle: number | null = null;
    private svgEl: SVGSVGElement | null = null;
    private prevDragAngle: number | null = null;
    private cachedSectors: Sector[] = [];
    private rafId: number | null = null;

    private async updateSector(sector: Sector): Promise<void> {
        if (sector.id) await this.plugin.store.updateSector(sector.id, sector);
    }

    private async deleteSector(sector: Sector): Promise<void> {
        if (sector.id) await this.plugin.store.deleteSector(sector.id);
    }

    private async reOrganizeTimeframe(
        timeframe: 'morning' | 'afternoon' | 'evening' | 'night'
    ): Promise<void> {
        const allSectors = await this.plugin.store.load(this.viewDate);
        const result = organizeTimeframe(allSectors, timeframe, this.plugin.settings);
        for (const s of result.updated) {
            if (s.id) await this.plugin.store.updateSector(s.id, s);
        }
    }

    private renderList(container: Element, sectors: Sector[]) {
        const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const list = container.createEl('div', { cls: 'sectograph-list' });

        // ── group sectors by timeframe ──────────────────────────────────────  
        const TIMEFRAME_ORDER = ['morning', 'afternoon', 'evening', 'night', ''] as const;
        const groups = new Map<string, Sector[]>();
        TIMEFRAME_ORDER.forEach(tf => groups.set(tf, []));
        sectors.forEach(s => {
            const key = s.timeframe ?? '';
            groups.get(key)?.push(s);
        });

        let sectorIndex = 0; // used for COLORS fallback  

        for (const tf of TIMEFRAME_ORDER) {
            const group = groups.get(tf)!;
            if (group.length === 0) continue;

            // ── timeframe header + shuffle button ────────────────────────────  
            if (tf) {
                const header = list.createEl('div', { cls: 'sectograph-timeframe-header' });
                header.createEl('span', { text: tf.charAt(0).toUpperCase() + tf.slice(1) });
                const shuffleBtn = header.createEl('button', { cls: 'sectograph-shuffle' });
                setIcon(shuffleBtn, 'shuffle');
                shuffleBtn.addEventListener('click', async () => {
                    const shuffled = [...group].sort(() => Math.random() - 0.5);
                    const others = this.cachedSectors.filter(s => s.timeframe !== tf);
                    const reordered = [...others, ...shuffled];
                    const result = organizeTimeframe(reordered, tf, this.plugin.settings);
                    for (const s of result.updated) {
                        if (s.id) await this.plugin.store.updateSector(s.id, s);
                    }
                    this.render();
                });
            }

            // ── UNCHANGED per-sector row code, now inside group.forEach ──────────  
            group.forEach((sector) => {
                const index = sectorIndex++;

                const row = list.createEl('div', { cls: 'sectograph-list-row' });

                const colorInput = row.createEl('input', { type: 'color', cls: 'sectograph-swatch' }) as HTMLInputElement;
                colorInput.value = sector.color ?? COLORS[index % COLORS.length];
                colorInput.addEventListener('change', async () => {
                    sector.color = colorInput.value;
                    await this.updateSector(sector);
                    this.render();
                });

                const titleInput = row.createEl('input', { cls: 'sectograph-input' }) as HTMLInputElement;
                titleInput.value = sector.title;
                titleInput.placeholder = 'Title';
                titleInput.addEventListener('change', async () => {
                    sector.title = titleInput.value;
                    await this.updateSector(sector);
                    this.render();
                });

                const startInput = row.createEl('input', { cls: 'sectograph-input sectograph-time' }) as HTMLInputElement;
                startInput.value = sector.start ?? '';
                startInput.placeholder = 'HH:MM';
                startInput.addEventListener('change', async () => {
                    sector.start = startInput.value;
                    await this.updateSector(sector);
                    this.render();
                });

                const endInput = row.createEl('input', { cls: 'sectograph-input sectograph-time' }) as HTMLInputElement;
                endInput.value = sector.end ?? '';
                endInput.placeholder = 'HH:MM';
                endInput.addEventListener('change', async () => {
                    sector.end = endInput.value;
                    await this.updateSector(sector);
                    this.render();
                });

                // ── CHANGED: deleteBtn now calls reOrganizeTimeframe ──────────────  
                const deleteBtn = row.createEl('button', { text: '×', cls: 'sectograph-delete' });
                deleteBtn.addEventListener('click', async () => {
                    const sectorTf = sector.timeframe;
                    await this.deleteSector(sector);
                    if (sectorTf) await this.reOrganizeTimeframe(sectorTf);
                    this.render();
                });

                const editBtn = row.createEl('button', { cls: 'sectograph-edit' });
                setIcon(editBtn, 'pencil');

                const details = list.createEl('div', { cls: 'sectograph-details' });
                details.style.display = 'none';
                editBtn.addEventListener('click', () => {
                    details.style.display = details.style.display === 'none' ? 'flex' : 'none';
                });

                // ── day-repeat checkboxes ─────────────────────────────  
                const dayRow = details.createEl('div', { cls: 'sectograph-day-row' });
                DAY_LABELS.forEach((label, i) => {
                    const wrapper = dayRow.createEl('label', { cls: 'sectograph-day-label' });
                    const cb = wrapper.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
                    cb.checked = (sector.days ?? []).includes(i);
                    cb.addEventListener('change', async () => {
                        let days = sector.days ?? [];
                        days = cb.checked ? [...days, i] : days.filter(d => d !== i);
                        sector.days = days;
                        await this.updateSector(sector);
                    });
                    wrapper.appendText(label);
                });

                // ── autoOrganize checkbox (all sectors) ──────────────────────────────  
                const autoOrgRow = details.createEl('div', { cls: 'sectograph-auto-org-row' });
                const autoOrgLabel = autoOrgRow.createEl('label');
                const autoOrgCb = autoOrgLabel.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
                autoOrgCb.checked = sector.autoOrganize !== false;
                autoOrgCb.addEventListener('change', async () => {
                    sector.autoOrganize = autoOrgCb.checked;
                    await this.updateSector(sector);
                    if (sector.timeframe) await this.reOrganizeTimeframe(sector.timeframe);
                    this.render();
                });
                autoOrgLabel.appendText(
                    sector.timeframe
                        ? ' Auto-organize'
                        : ' Fixed (organize around this sector)'
                );
            });
        }
    }
}