import { Sector } from './types';
import { SectographSettings } from './settings';

const MIN_DURATION = 5; // minimum sector duration in minutes  

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
    if (tfEnd <= tfStart) tfEnd += 24 * 60; // handle midnight wrap (e.g. evening 17:00–00:00)  

    const capacity = tfEnd - tfStart;

    // Only sectors opted in to auto-organize, in the order they appear in allSectors  
    const toOrganize = allSectors.filter(
        s => s.timeframe === timeframe && s.autoOrganize !== false
    );
    if (toOrganize.length === 0) return { updated: allSectors };

    let durations = toOrganize.map(s => s.duration ?? 60);
    let total = durations.reduce((a, b) => a + b, 0);

    if (total > capacity) {
        const scale = capacity / total;
        durations = durations.map(d => d * scale);
        if (durations.some(d => d < MIN_DURATION)) {
            return {
                updated: allSectors,
                warning: `The "${timeframe}" timeframe is full. Cannot fit any more sectors.`
            };
        }
        total = capacity;
    }

    const groupStart = tfStart + (capacity - total) / 2;
    const result = [...allSectors];
    let cursor = groupStart;

    for (let i = 0; i < toOrganize.length; i++) {
        const sector = toOrganize[i];
        const duration = durations[i];
        const start = minutesToTime(cursor % (24 * 60));
        const end = minutesToTime((cursor + duration) % (24 * 60));
        const idx = result.findIndex(s => s === sector || (s.id && s.id === sector.id));
        if (idx !== -1) result[idx] = { ...result[idx], start, end };
        cursor += duration;
    }

    return { updated: result };
}