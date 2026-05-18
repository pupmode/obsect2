import { Sector } from './types';
import { SectographSettings } from './settings';

const MIN_DURATION = 5;

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.round(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function organizeTimeframe(
    allSectors: Sector[],
    timeframe: 'morning' | 'afternoon' | 'evening' | 'night',
    settings: SectographSettings
): { updated: Sector[]; warning?: string } {
    const tf = settings.timeframes[timeframe];
    let tfStart = timeToMinutes(tf.start);
    let tfEnd = timeToMinutes(tf.end);
    if (tfEnd <= tfStart) tfEnd += 24 * 60; // midnight wrap  

    // ── Find fixed blocks within this timeframe ──────────────────────────────  
    // Fixed = any sector with autoOrganize === false that has explicit times  
    const fixedBlocks = allSectors
        .filter(s => s.autoOrganize === false && s.start && s.end)
        .map(s => {
            let sStart = timeToMinutes(s.start!);
            let sEnd = timeToMinutes(s.end!);
            if (sEnd <= sStart) sEnd += 24 * 60;
            return { start: sStart, end: sEnd };
        })
        .filter(b => b.start < tfEnd && b.end > tfStart)
        .map(b => ({ start: Math.max(b.start, tfStart), end: Math.min(b.end, tfEnd) }))
        .sort((a, b) => a.start - b.start);

    // ── Compute free intervals (gaps between fixed blocks) ───────────────────  
    const freeIntervals: { start: number; end: number }[] = [];
    let pos = tfStart;
    for (const block of fixedBlocks) {
        if (block.start > pos) freeIntervals.push({ start: pos, end: block.start });
        pos = Math.max(pos, block.end);
    }
    if (pos < tfEnd) freeIntervals.push({ start: pos, end: tfEnd });

    const totalFree = freeIntervals.reduce((a, b) => a + (b.end - b.start), 0);

    // ── Sectors to auto-organize ─────────────────────────────────────────────  
    const toOrganize = allSectors.filter(
        s => s.timeframe === timeframe && s.autoOrganize !== false
    );
    if (toOrganize.length === 0) return { updated: allSectors };

    let durations = toOrganize.map(s => s.duration ?? 60);
    let total = durations.reduce((a, b) => a + b, 0);

    if (total > totalFree) {
        const scale = totalFree / total;
        durations = durations.map(d => d * scale);
        if (durations.some(d => d < MIN_DURATION)) {
            return {
                updated: allSectors,
                warning: `The "${timeframe}" timeframe is full. Cannot fit any more sectors.`
            };
        }
        total = totalFree;
    }

    // ── Place sectors within free intervals, centered ────────────────────────  
    // Skip (totalFree - total) / 2 free minutes before placing the first sector  
    const offset = (totalFree - total) / 2;
    const result = [...allSectors];

    let intervalIdx = 0;
    let posInInterval = 0;

    // Advance through free space by `offset` to achieve centering  
    let remaining = offset;
    while (remaining > 0 && intervalIdx < freeIntervals.length) {
        const available = (freeIntervals[intervalIdx].end - freeIntervals[intervalIdx].start) - posInInterval;
        if (remaining <= available) {
            posInInterval += remaining;
            remaining = 0;
        } else {
            remaining -= available;
            intervalIdx++;
            posInInterval = 0;
        }
    }

    // Place each sector sequentially; if it doesn't fit in the current  
    // free interval, move it to the start of the next one  
    for (let i = 0; i < toOrganize.length; i++) {
        if (intervalIdx >= freeIntervals.length) break;

        const duration = durations[i];
        const interval = freeIntervals[intervalIdx];
        const available = (interval.end - interval.start) - posInInterval;

        let startActual: number;
        if (duration <= available) {
            startActual = interval.start + posInInterval;
            posInInterval += duration;
        } else {
            // Doesn't fit here — jump to next free interval  
            intervalIdx++;
            posInInterval = 0;
            if (intervalIdx >= freeIntervals.length) break;
            startActual = freeIntervals[intervalIdx].start;
            posInInterval = duration;
        }

        const endActual = startActual + duration;
        const start = minutesToTime(startActual % (24 * 60));
        const end = minutesToTime(endActual % (24 * 60));
        const idx = result.findIndex(s => s === toOrganize[i] || (s.id && s.id === toOrganize[i].id));
        if (idx !== -1) result[idx] = { ...result[idx], start, end };
    }

    return { updated: result };
}