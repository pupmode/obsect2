import { Sector } from './types';
import { setIcon } from 'obsidian';  

// Layout constants — all values are in SVG units (total clock radius = 90)  
const INNER_R = 27;  // inner boundary of arcs (edge of empty center)  
const ARC_R = 81;  // outer boundary of arcs  
const TICK_R = 81;  // inner edge of tick ring  
const HRS_R = 67; // hours location
const OPAC = '0.7'; // sector opacity
const BGcolor = '#262626'
const RIMcolor = '#0c0c0c'
const red = '#ff0e2e'

function timeToAngle(time: string, use12h: boolean): number {
    const [h, m] = time.split(':').map(Number);
    if (use12h) {
        return ((h % 12) * 60 + m) / 720 * 360 - 90;
    }
    return (h * 60 + m) / 1440 * 360 - 90;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number, y: number } {
    const radians = angleDeg * Math.PI / 180;
    return {
        x: cx + r * Math.cos(radians),
        y: cy + r * Math.sin(radians),
    };
}

export const COLORS = ['#e06c75', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2'];

function expandSectors(sectors: Sector[]): Sector[] {
    const result: Sector[] = [];
    for (const sector of sectors) {
        const [sh, sm] = sector.start.split(':').map(Number);
        const [eh, em] = sector.end.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;

        if (endMins < startMins && endMins !== 0) {
            // Crosses midnight — split into PM part and AM part  
            result.push({ ...sector, end: '00:00' }); // PM part: ends at top  
            result.push({ ...sector, start: '00:00' }); // AM part: starts at top  
        } else if (startMins < 12 * 60 && endMins > 12 * 60) {
            // Crosses noon — split into AM part and PM part  
            result.push({ ...sector, end: '12:00' }); // AM part: ends at top  
            result.push({ ...sector, start: '12:00' }); // PM part: starts at top  
        } else {
            result.push(sector); // normal sector, no split needed  
        }
    }
    return result;
}

export function renderClock(container: Element, sectors: Sector[], use12h: boolean, showPM: boolean): void {
    const isPM = use12h ? showPM : new Date().getHours() >= 12;
    const windowStart = isPM ? 12 : 0;

    const visibleSectors = (use12h
        ? expandSectors(sectors).filter(s => {   // ← wrap with expandSectors  
            const h = parseInt(s.start.split(':')[0]);
            return h >= windowStart && h < windowStart + 12;
        })
        : sectors)
        .slice()  
        .sort((a, b) => {
            const [ah, am] = a.start.split(':').map(Number);
            const [bh, bm] = b.start.split(':').map(Number);
            return (ah * 60 + am) - (bh * 60 + bm);
        });

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const handAngle = timeToAngle(`${hh}:${mm}`, use12h);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sectograph-clock');
    svg.setAttribute('width', '100%');
    svg.setAttribute('viewBox', '0 0 200 200');

    // Clock face background  
    const face = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    face.setAttribute('cx', '100');
    face.setAttribute('cy', '100');
    face.setAttribute('r', '90');
    face.setAttribute('fill', BGcolor);
    face.setAttribute('stroke', '#888');
    face.setAttribute('stroke-width', '1');
    svg.appendChild(face);

    // Tick marks and hour numbers  
    const hours = use12h ? 12 : 24;
    const subTickStep = 360 / hours / 5;  // angle between sub-ticks  

    for (let hour = 0; hour < hours; hour++) {
        const hourAngle = (hour / hours) * 360 - 90;

        // Hour tick — thick, from r=90 to TICK_R  
        const outerH = polarToCartesian(100, 100, 90, hourAngle);
        const innerH = polarToCartesian(100, 100, TICK_R, hourAngle);
        const hourTick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hourTick.setAttribute('x1', String(outerH.x));
        hourTick.setAttribute('y1', String(outerH.y));
        hourTick.setAttribute('x2', String(innerH.x));
        hourTick.setAttribute('y2', String(innerH.y));
        hourTick.setAttribute('stroke', '#cccccc');
        hourTick.setAttribute('stroke-width', '1.5');
        svg.appendChild(hourTick);

        // Hour inner
        const outerH2 = polarToCartesian(100, 100, 30, hourAngle);
        const innerH2 = polarToCartesian(100, 100, 60, hourAngle);
        const hourTick2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hourTick2.setAttribute('x1', String(outerH2.x));
        hourTick2.setAttribute('y1', String(outerH2.y));
        hourTick2.setAttribute('x2', String(innerH2.x));
        hourTick2.setAttribute('y2', String(innerH2.y));
        hourTick2.setAttribute('stroke', '#363636');
        hourTick2.setAttribute('stroke-width', '0.5');
        svg.appendChild(hourTick2);

        // Hour number / icon — inside the arc area  
        const labelPos = polarToCartesian(100, 100, HRS_R, hourAngle);
        const showMoon = (use12h && hour === 0 && isPM) || (!use12h && hour === 12);
        const showSun = (use12h && hour === 0 && !isPM) || (!use12h && hour === 0);

        if (showSun || showMoon) {
            const iconSize = 10;               // desired size in SVG units  
            const scale = iconSize / 18;       // Lucide viewBox is always 0 0 24 24  
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('transform',
                `translate(${labelPos.x}, ${labelPos.y}) scale(${scale}) translate(-12, -12)`
            );

            if (showMoon) {
                const moonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                moonPath.setAttribute('d', 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401');
                moonPath.setAttribute('fill', '#cccccc');
                moonPath.setAttribute('stroke', 'none');
                g.appendChild(moonPath);
            } else {
                // Sun center circle  
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '12');
                circle.setAttribute('cy', '12');
                circle.setAttribute('r', '6'); // inner radius
                circle.setAttribute('fill', '#cccccc');
                circle.setAttribute('stroke', 'none');
                g.appendChild(circle);

                // Sun rays — one <path> per ray  
                const rays = [
                    'M12 3v1', 'M12 20v1',
                    'm4.93 4.93 0.7 0.7', 'm17.66 17.66 0.7 0.7',
                    'M3 12h1', 'M20 12h1',
                    'm6.34 17.66-0.7 0.7', 'm19.07 4.93-0.7 0.7'
                ];
                for (const d of rays) {
                    const ray = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    ray.setAttribute('d', d);
                    ray.setAttribute('fill', 'none');
                    ray.setAttribute('stroke', '#cccccc');
                    ray.setAttribute('stroke-width', '2');
                    ray.setAttribute('stroke-linecap', 'round');
                    g.appendChild(ray);
                }
            }
            svg.appendChild(g);

        } else {
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', String(labelPos.x));
            label.setAttribute('y', String(labelPos.y));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'central');
            label.setAttribute('font-size', '9');
            label.setAttribute('class', 'sectograph-hour-label');
            label.textContent = use12h
                ? (isPM ? String(12 + hour) : String(hour).padStart(2, '0'))
                : String(hour);
            svg.appendChild(label);
        }

        // 4 intermediate minute ticks — thin, shorter than hour ticks  
        for (let sub = 1; sub <= 4; sub++) {
            const subAngle = hourAngle + sub * subTickStep;
            const outerS = polarToCartesian(100, 100, 90, subAngle);
            const innerS = polarToCartesian(100, 100, TICK_R + 4, subAngle);
            const subTick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            subTick.setAttribute('x1', String(outerS.x));
            subTick.setAttribute('y1', String(outerS.y));
            subTick.setAttribute('x2', String(innerS.x));
            subTick.setAttribute('y2', String(innerS.y));
            subTick.setAttribute('stroke', '#666666');
            subTick.setAttribute('stroke-width', '0.5');
            svg.appendChild(subTick);
        }
    }

    // Day name + date number  
    const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayName = DAY_NAMES[now.getDay()];
    const dateNum = now.getDate();

    // <defs> block — holds gradient definitions (must be added to svg before use)  
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    const timerTexts: Element[] = [];

    // Transition arcs — connect one sector to another  
    for (let i = 0; i < visibleSectors.length - 1; i++) {
        const sectorA = visibleSectors[i];  
        const sectorB = visibleSectors[i + 1];    
        const startAngle = timeToAngle(sectorA.end, use12h);
        const endAngle = timeToAngle(sectorB.start, use12h);

        if (endAngle < startAngle) continue;

        // Skip if sectorA ends at the window boundary (split sector edge)  
        if (use12h) {
            const [aEH, aEM] = sectorA.end.split(':').map(Number);
            const boundaryMins = ((windowStart + 12) * 60) % (24 * 60); // 0 for PM, 720 for AM  
            if (aEH * 60 + aEM === boundaryMins) continue;
        }

        const r = 40;
        const hw = 6;

        // Gradient runs from the midpoint of the start edge to the midpoint of the end edge  
        const gradStart = polarToCartesian(100, 100, r, startAngle);
        const gradEnd = polarToCartesian(100, 100, r, endAngle);

        const gradId = `trans-grad-${i}`;
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', gradId);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', String(gradStart.x));
        grad.setAttribute('y1', String(gradStart.y));
        grad.setAttribute('x2', String(gradEnd.x));
        grad.setAttribute('y2', String(gradEnd.y));

        const colorA = sectorA.color ?? COLORS[i % COLORS.length];
        const colorB = sectorB.color ?? COLORS[(i + 1) % COLORS.length];

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', colorA);
        grad.appendChild(stop1);

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', colorB);
        grad.appendChild(stop2);

        defs.appendChild(grad);

        // Arc path  
        const outerStart = polarToCartesian(100, 100, r + hw, startAngle);
        const outerEnd = polarToCartesian(100, 100, r + hw, endAngle);
        const innerEnd = polarToCartesian(100, 100, r - hw, endAngle);
        const innerStart = polarToCartesian(100, 100, r - hw, startAngle);
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;

        const arcSpan = endAngle - startAngle;
        const arcLength = (arcSpan / 360) * 2 * Math.PI * r;
        const fullFontSize = 7;
        const scalingThreshold = fullFontSize * 2;   // scale kicks in below this arc length  
        const isScaling = arcLength < scalingThreshold;
        const fontSize = isScaling ? Math.max(2, arcLength / 2) : fullFontSize;

        const d = [
            `M ${outerStart.x} ${outerStart.y}`,
            `A ${r + hw} ${r + hw} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
            `L ${innerEnd.x} ${innerEnd.y}`,
            `A ${r - hw} ${r - hw} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
            'Z'
        ].join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', `url(#${gradId})`);
        path.setAttribute('opacity', OPAC);
        if (!isScaling) svg.appendChild(path);   // hide arc when scaling  

        // Duration label  
        const midAngle = (startAngle + endAngle) / 2;
        const midPos = polarToCartesian(100, 100, r, midAngle);

        const [aH, aM] = sectorA.end.split(':').map(Number);
        const [bH, bM] = sectorB.start.split(':').map(Number);
        const gapMins = (bH * 60 + bM) - (aH * 60 + aM);
        const gapH = Math.floor(gapMins / 60);
        const gapM = gapMins % 60;
        const gapLabel = gapH === 0 ? `${gapM}m` : gapM === 0 ? `${gapH}h` : `${gapH}h${gapM}`;

        let textAngle = midAngle + 90;
        if (midAngle > 0 && midAngle < 180) textAngle += 180;

        if (arcLength > 0) {
            if (!isScaling) {
                const charCount = gapLabel.length;
                const textWidth = fontSize * 0.6 * charCount + 4;   // +4 padding  
                const halfSpan = (textWidth / (2 * Math.PI * r)) * 360;

                const bgStartAngle = midAngle - halfSpan / 2;
                const bgEndAngle = midAngle + halfSpan / 2;

                const bgOS = polarToCartesian(100, 100, r + hw, bgStartAngle);
                const bgOE = polarToCartesian(100, 100, r + hw, bgEndAngle);
                const bgIE = polarToCartesian(100, 100, r - hw, bgEndAngle);
                const bgIS = polarToCartesian(100, 100, r - hw, bgStartAngle);

                const bgD = [
                    `M ${bgOS.x} ${bgOS.y}`,
                    `A ${r + hw} ${r + hw} 0 0 1 ${bgOE.x} ${bgOE.y}`,
                    `L ${bgIE.x} ${bgIE.y}`,
                    `A ${r - hw} ${r - hw} 0 0 0 ${bgIS.x} ${bgIS.y}`,
                    'Z'
                ].join(' ');

                const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                bgPath.setAttribute('d', bgD);
                bgPath.setAttribute('fill', BGcolor);
                bgPath.setAttribute('stroke', BGcolor);
                bgPath.setAttribute('stroke-width', '2');
                svg.appendChild(bgPath);
            }

            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', String(midPos.x));
            txt.setAttribute('y', String(midPos.y - 1));
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('dominant-baseline', 'central');
            txt.setAttribute('font-size', String(fontSize));   // was hardcoded '7'  
            txt.setAttribute('fill', `url(#${gradId})`);
            txt.setAttribute('font-weight', 'bold');
            txt.setAttribute('stroke', BGcolor);
            txt.setAttribute('stroke-width', '2');
            txt.setAttribute('paint-order', 'stroke');
            txt.setAttribute('transform', `rotate(${textAngle}, ${midPos.x}, ${midPos.y})`);
            txt.textContent = gapLabel;
            timerTexts.push(txt);
        }
    }

    // Countdown arc — from current time to start of next upcoming sector  
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const nextSector = visibleSectors.find(s => {
        const [sh, sm] = s.start.split(':').map(Number);
        return (sh * 60 + sm) > nowMinutes;
    });

    if (nextSector) {
        const [bH, bM] = nextSector.start.split(':').map(Number);
        const bMinutes = bH * 60 + bM;
        const gapEnd = timeToAngle(nextSector.start, use12h);

        if (gapEnd > handAngle) {
            const r = 53;
            const hw = 4;

            const startAngle = handAngle;
            const endAngle = gapEnd;
            const largeArc = endAngle - startAngle > 180 ? 1 : 0;

            const arcSpan = endAngle - startAngle;
            const arcLength = (arcSpan / 360) * 2 * Math.PI * r;
            const fullFontSize = 6;
            const scalingThreshold = fullFontSize * 2;   // scale kicks in below this arc length  
            const isScaling = arcLength < scalingThreshold;
            const fontSize = isScaling ? Math.max(5, arcLength / 1.1) : fullFontSize;

            const outerStart = polarToCartesian(100, 100, r + hw, startAngle);
            const outerEnd = polarToCartesian(100, 100, r + hw, endAngle);
            const innerEnd = polarToCartesian(100, 100, r - hw, endAngle);
            const innerStart = polarToCartesian(100, 100, r - hw, startAngle);

            const d = [
                `M ${outerStart.x} ${outerStart.y}`,
                `A ${r + hw} ${r + hw} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
                `L ${innerEnd.x} ${innerEnd.y}`,
                `A ${r - hw} ${r - hw} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
                'Z'
            ].join(' ');

            const colorB = nextSector.color ?? COLORS[visibleSectors.indexOf(nextSector) % COLORS.length];

            // Gradient: red (hand) → colorB (target sector)  
            const countGradId = 'countdown-grad';
            const countGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            countGrad.setAttribute('id', countGradId);
            countGrad.setAttribute('gradientUnits', 'userSpaceOnUse');

            const gradStart = polarToCartesian(100, 100, r, startAngle);
            const gradEnd = polarToCartesian(100, 100, r, endAngle);
            countGrad.setAttribute('x1', String(gradStart.x));
            countGrad.setAttribute('y1', String(gradStart.y));
            countGrad.setAttribute('x2', String(gradEnd.x));
            countGrad.setAttribute('y2', String(gradEnd.y));

            const cStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            cStop1.setAttribute('offset', '0%');
            cStop1.setAttribute('stop-color', red);   // hour hand colour  
            countGrad.appendChild(cStop1);

            const cStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            cStop2.setAttribute('offset', '100%');
            cStop2.setAttribute('stop-color', colorB);
            countGrad.appendChild(cStop2);

            defs.appendChild(countGrad);

            const countPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            countPath.setAttribute('d', d);
            countPath.setAttribute('fill', `url(#${countGradId})`);   // ← was colorB  
            countPath.setAttribute('opacity', '0.6');
            if (!isScaling) svg.appendChild(countPath);  

            // Timer label  
            const diffMinutes = bMinutes - nowMinutes;
            const dh = Math.floor(diffMinutes / 60);
            const dm = diffMinutes % 60;
            const timerLabel = dh > 0
                ? (dm > 0 ? `${dh}:${String(dm).padStart(2, '0')}` : `${dh}h`)
                : `${dm}m`;

            const midAngle = (startAngle + endAngle) / 2;
            const midPos = polarToCartesian(100, 100, r, midAngle);

            let textAngle = midAngle + 90;
            if (midAngle > 0 && midAngle < 180) textAngle += 180;

            if (arcLength > 0) {
                if (!isScaling) {
                    const charCount = timerLabel.length;
                    const textWidth = fontSize * 0.6 * charCount + 4;   // +4 padding  
                    const halfSpan = (textWidth / (2 * Math.PI * r)) * 360;

                    const bgStartAngle = midAngle - halfSpan / 2;
                    const bgEndAngle = midAngle + halfSpan / 2;

                    const bgOS = polarToCartesian(100, 100, r + hw, bgStartAngle);
                    const bgOE = polarToCartesian(100, 100, r + hw, bgEndAngle);
                    const bgIE = polarToCartesian(100, 100, r - hw, bgEndAngle);
                    const bgIS = polarToCartesian(100, 100, r - hw, bgStartAngle);

                    const bgD = [
                        `M ${bgOS.x} ${bgOS.y}`,
                        `A ${r + hw} ${r + hw} 0 0 1 ${bgOE.x} ${bgOE.y}`,
                        `L ${bgIE.x} ${bgIE.y}`,
                        `A ${r - hw} ${r - hw} 0 0 0 ${bgIS.x} ${bgIS.y}`,
                        'Z'
                    ].join(' ');

                    const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    bgPath.setAttribute('d', bgD);
                    bgPath.setAttribute('fill', BGcolor);
                    bgPath.setAttribute('stroke', BGcolor);
                    bgPath.setAttribute('stroke-width', '2');
                    svg.appendChild(bgPath);
                }

                const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                lbl.setAttribute('x', String(midPos.x));
                lbl.setAttribute('y', String(midPos.y));
                lbl.setAttribute('text-anchor', 'middle');
                lbl.setAttribute('dominant-baseline', 'central');
                lbl.setAttribute('font-size', String(fontSize));
                lbl.setAttribute('fill', `url(#${countGradId})`);
                lbl.setAttribute('stroke', BGcolor);
                lbl.setAttribute('stroke-width', '2');
                lbl.setAttribute('font-weight', 'bold');
                lbl.setAttribute('paint-order', 'stroke');
                lbl.setAttribute('transform', `rotate(${textAngle}, ${midPos.x}, ${midPos.y})`);
                lbl.textContent = timerLabel;
                timerTexts.push(lbl);
            }
        }
    }

    // Sector arcs — annular (donut) segments between INNER_R and ARC_R  
    visibleSectors.forEach((sector, index) => {
        let startAngle = timeToAngle(sector.start, use12h);
        let endAngle = timeToAngle(sector.end, use12h);
        if (endAngle < startAngle) endAngle += 360;
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;

        const outerStart = polarToCartesian(100, 100, 90, startAngle);
        const outerEnd = polarToCartesian(100, 100, 90, endAngle);
        const innerEnd = polarToCartesian(100, 100, INNER_R, endAngle);
        const innerStart = polarToCartesian(100, 100, INNER_R, startAngle);

        const d = [
            `M ${outerStart.x} ${outerStart.y}`,
            `A 90 90 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
            `L ${innerEnd.x} ${innerEnd.y}`,
            `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
            'Z'
        ].join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', sector.color ?? COLORS[index % COLORS.length]);
        path.setAttribute('opacity', OPAC);
        svg.appendChild(path);

        // Sector name label — radial, readable orientation  
        const midAngle = (startAngle + endAngle) / 2;
        const labelR = 55;
        const labelPos = polarToCartesian(100, 100, labelR, midAngle);

        let sectorTextAngle = midAngle;
        if (midAngle > 90 && midAngle < 270) sectorTextAngle += 180;

        const sectorLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        sectorLabel.setAttribute('x', String(labelPos.x));
        sectorLabel.setAttribute('y', String(labelPos.y));
        sectorLabel.setAttribute('text-anchor', 'middle');
        sectorLabel.setAttribute('dominant-baseline', 'central');
        sectorLabel.setAttribute('font-size', '6');
        sectorLabel.setAttribute('fill', '#ffffff');
        sectorLabel.setAttribute('paint-order', 'stroke');
        sectorLabel.setAttribute('transform', `rotate(${sectorTextAngle}, ${labelPos.x}, ${labelPos.y})`);
        sectorLabel.textContent = sector.title;
        timerTexts.push(sectorLabel);

        // --- Thin arc + duration label (hover only) ---  
        const THIN_INNER = 76;
        const THIN_OUTER = 78;
        const lblTime = 74;

        const [sh, sm] = sector.start.split(':').map(Number);
        const [eh, em] = sector.end.split(':').map(Number);
        let durationMins = (eh * 60 + em) - (sh * 60 + sm);
        if (durationMins <= 0) durationMins += 720;
        const dh = Math.floor(durationMins / 60);
        const dm = durationMins % 60;
        const durationLabel = dh > 0 ? (dm > 0 ? `${dh}h${dm}` : `${dh}h`) : `${dm}m`;

        const fontSize = 5;
        const charCount = durationLabel.length;
        const labelArcLength = charCount * fontSize * 0.5;
        const labelSpan = (labelArcLength / (2 * Math.PI * lblTime)) * 360;
        const arcEndAngle = endAngle - labelSpan;

        // hoverEls stores [element, targetOpacity] pairs  
        const hoverEls: Array<[SVGElement, string]> = [];

        if (arcEndAngle > startAngle) {
            const arcLargeArc = arcEndAngle - startAngle > 180 ? 1 : 0;

            const thinOuterStart = polarToCartesian(100, 100, THIN_OUTER, startAngle);
            const thinOuterEnd = polarToCartesian(100, 100, THIN_OUTER, arcEndAngle);
            const thinInnerEnd = polarToCartesian(100, 100, THIN_INNER, arcEndAngle);
            const thinInnerStart = polarToCartesian(100, 100, THIN_INNER, startAngle);

            const thinD = [
                `M ${thinOuterStart.x} ${thinOuterStart.y}`,
                `A ${THIN_OUTER} ${THIN_OUTER} 0 ${arcLargeArc} 1 ${thinOuterEnd.x} ${thinOuterEnd.y}`,
                `L ${thinInnerEnd.x} ${thinInnerEnd.y}`,
                `A ${THIN_INNER} ${THIN_INNER} 0 ${arcLargeArc} 0 ${thinInnerStart.x} ${thinInnerStart.y}`,
                'Z'
            ].join(' ');

            const thinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            thinPath.setAttribute('d', thinD);
            thinPath.setAttribute('fill', BGcolor);
            thinPath.style.opacity = '0';
            thinPath.style.pointerEvents = 'none';
            thinPath.style.transition = 'opacity 0.2s ease';
            svg.appendChild(thinPath);
            hoverEls.push([thinPath, '0.5']);  // target opacity when visible  
        }

        // Duration label  
        const labelAngleMid = arcEndAngle + labelSpan / 2;
        const lblPos = polarToCartesian(100, 100, lblTime, labelAngleMid);

        let labelTextAngle = labelAngleMid;
        if (labelAngleMid > 90 && labelAngleMid < 270) labelTextAngle += 180;

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', String(lblPos.x));
        lbl.setAttribute('y', String(lblPos.y));
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('dominant-baseline', 'central');
        lbl.setAttribute('font-size', String(fontSize));
        lbl.setAttribute('paint-order', 'stroke');
        lbl.setAttribute('stroke', '#b6b6b6');
        lbl.setAttribute('stroke-width', '1');
        lbl.setAttribute('fill', BGcolor);
        lbl.setAttribute('font-weight', '500');
        lbl.setAttribute('transform', `rotate(${labelTextAngle}, ${lblPos.x}, ${lblPos.y})`);
        lbl.textContent = durationLabel;
        lbl.style.opacity = '0';
        lbl.style.pointerEvents = 'none';
        lbl.style.transition = 'opacity 0.2s ease';
        timerTexts.push(lbl);
        hoverEls.push([lbl, '0.5']);  // target opacity when visible  

        // Fade in on hover, fade out on mouseout  
        path.addEventListener('mouseover', () => {
            hoverEls.forEach(([el, targetOpacity]) => {
                el.style.opacity = targetOpacity;
                el.style.pointerEvents = 'auto';
            });
        });
        path.addEventListener('mouseout', () => {
            hoverEls.forEach(([el]) => {
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            });
        });
    });

    // Rim circle  
    for (const r of [ARC_R, INNER_R, TICK_R]) {
        const sep = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sep.setAttribute('cx', '100');
        sep.setAttribute('cy', '100');
        sep.setAttribute('r', String(r));
        sep.setAttribute('fill', 'none');
        svg.appendChild(sep);
    }

    // Outer rim — annular ring from ARC_R to 90 with a different background  
    const rim = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rim.setAttribute('cx', '100');
    rim.setAttribute('cy', '100');
    rim.setAttribute('r', String((90 + ARC_R) / 2));  // midpoint = 85.5  
    rim.setAttribute('fill', 'none');
    rim.setAttribute('stroke', RIMcolor);
    rim.setAttribute('opacity', '0.3');
    rim.setAttribute('stroke-width', String(90 - ARC_R));  // = 9, spans from 81 to 90  
    svg.appendChild(rim);

    // Clock hand  
    const tip = polarToCartesian(100, 100, ((INNER_R + ARC_R) / 2) + 1.5, handAngle);

    const base = polarToCartesian(100, 100, (INNER_R + 1), handAngle);

    const hand = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hand.setAttribute('x1', String(base.x));
    hand.setAttribute('y1', String(base.y));
    hand.setAttribute('x2', String(tip.x));
    hand.setAttribute('y2', String(tip.y));
    hand.setAttribute('stroke', red);
    hand.setAttribute('stroke-width', '3');
    hand.setAttribute('stroke-linecap', 'square');
    svg.appendChild(hand);

    container.appendChild(svg);

    // Clock hand 2 — square dashes  
    const startR = INNER_R + 5;
    const endR = TICK_R + 4;
    const dashW = 2;   // length along the hand direction  
    const dashH = 2.9;   // thickness perpendicular to the hand  
    const dashGap = 2; // gap between squares  
    const dashStep = dashW + dashGap;

    for (let r = startR; r < endR; r += dashStep) {
        const pos = polarToCartesian(100, 100, r, handAngle);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(pos.x - dashW / 2));  // ← half of width  
        rect.setAttribute('y', String(pos.y - dashH / 2));  // ← half of height  
        rect.setAttribute('width', String(dashW));
        rect.setAttribute('height', String(dashH));
        rect.setAttribute('fill', red);
        rect.setAttribute('transform', `rotate(${handAngle}, ${pos.x}, ${pos.y})`);
        rect.setAttribute('opacity', '0.3');
        svg.appendChild(rect);
    }

    // Clock hand ball  
    const ballPos = polarToCartesian(100, 100, 90, handAngle);  // single point on the outer edge  

    const hand3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hand3.setAttribute('cx', String(ballPos.x));  // ← .x, converted to string  
    hand3.setAttribute('cy', String(ballPos.y));  // ← .y, converted to string  
    hand3.setAttribute('r', '4');
    hand3.setAttribute('fill', red);
    svg.appendChild(hand3);

    // Separator circles  
    const dig = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dig.setAttribute('cx', '100');
    dig.setAttribute('cy', '100');
    dig.setAttribute('r', '26');
    dig.setAttribute('fill', 'black');
    svg.appendChild(dig);

    // Digital time  
    const digitalTime = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    digitalTime.setAttribute('x', '100');
    digitalTime.setAttribute('y', '97');
    digitalTime.setAttribute('text-anchor', 'middle');
    digitalTime.setAttribute('dominant-baseline', 'central');
    digitalTime.setAttribute('font-size', '13');
    digitalTime.setAttribute('class', 'sectograph-digital-time');
    digitalTime.textContent = `${hh}:${mm}`;
    svg.appendChild(digitalTime);

    // Day + date  
    const digitalDate = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    digitalDate.setAttribute('x', '100');
    digitalDate.setAttribute('y', '108');
    digitalDate.setAttribute('text-anchor', 'middle');
    digitalDate.setAttribute('dominant-baseline', 'central');
    digitalDate.setAttribute('font-size', '10');
    digitalDate.setAttribute('class', 'sectograph-digital-date');
    digitalDate.textContent = `${dayName} ${dateNum}`;
    svg.appendChild(digitalDate);

    // Timer labels — drawn last so they appear above everything  
    for (const el of timerTexts) svg.appendChild(el);
    container.appendChild(svg);
}