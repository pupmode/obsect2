import { Sector } from './types';

// Layout constants — all values are in SVG units (total clock radius = 90)  
const INNER_R = 31;   // inner boundary of arcs (edge of empty center)  
const ARC_R = 81;   // outer boundary of arcs  
const TICK_R = 81;   // inner edge of tick ring  
const HRS_R = 67;   // hours label location  
const OPAC = '0.7';
const BGcolor = '#262626';
const RIMcolor = '#0c0c0c';
const red = '#ff0e2e';
const thinPathCL = '#eeee';

// #region Helpers  

function makePath(d: string, fill: string, opacity?: string): SVGPathElement {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill);
    if (opacity) p.setAttribute('opacity', opacity);
    return p;
}
function angleToHoursMinutes(angle: number, use12h: boolean, showPM: boolean): { h: number, m: number } {
    const normalized = ((angle + 90) % 360 + 360) % 360;
    if (use12h) {
        const totalMinutes = Math.round(normalized / 360 * 720);
        const h = (Math.floor(totalMinutes / 60) % 12) + (showPM ? 12 : 0);
        const m = totalMinutes % 60;
        return { h, m };
    } else {
        const totalMinutes = Math.round(normalized / 360 * 1440);
        return { h: Math.floor(totalMinutes / 60) % 24, m: totalMinutes % 60 };
    }
}
function timeToAngle(time: string, use12h: boolean): number {
    const [h, m] = time.split(':').map(Number);
    if (use12h) return ((h % 12) * 60 + m) / 720 * 360 - 90;
    return (h * 60 + m) / 1440 * 360 - 90;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
    const rad = angleDeg * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Annular arc path (donut segment) from outerR down to innerR. */
function makeArcPath(outerR: number, innerR: number, startAngle: number, endAngle: number): string {
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const os = polarToCartesian(100, 100, outerR, startAngle);
    const oe = polarToCartesian(100, 100, outerR, endAngle);
    const ie = polarToCartesian(100, 100, innerR, endAngle);
    const is_ = polarToCartesian(100, 100, innerR, startAngle);
    return [
        `M ${os.x} ${os.y}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oe.x} ${oe.y}`,
        `L ${ie.x} ${ie.y}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${is_.x} ${is_.y}`,
        'Z'
    ].join(' ');
}

/** Single open arc path (for textPath use). Reversed = counter-clockwise, for bottom-half text. */
function makeSimpleArcPath(r: number, startAngle: number, endAngle: number, reversed = false): string {
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    if (reversed) {
        const s = polarToCartesian(100, 100, r, endAngle);
        const e = polarToCartesian(100, 100, r, startAngle);
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 0 ${e.x} ${e.y}`;
    }
    const s = polarToCartesian(100, 100, r, startAngle);
    const e = polarToCartesian(100, 100, r, endAngle);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

/** Appends a two-stop linearGradient to defs. */
function makeGradient(
    defs: SVGDefsElement,
    id: string,
    x1: number, y1: number,
    x2: number, y2: number,
    colorA: string, colorB: string
): void {
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', String(x1)); grad.setAttribute('y1', String(y1));
    grad.setAttribute('x2', String(x2)); grad.setAttribute('y2', String(y2));

    const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', colorA);
    const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', colorB);

    grad.appendChild(s1); grad.appendChild(s2);
    defs.appendChild(grad);
}

export const COLORS = ['#e06c75', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2'];

// Timeframe rim colors  
const TIMEFRAME_COLORS: Record<string, string> = {
    morning: '#000000',   // warm yellow  
    afternoon: '#000000',   // amber  
    evening: '#000000',   // deep red  
    night: '#000000',   // dark blue  
};
const TIMEFRAME_RIM_INNER = 27;
const TIMEFRAME_RIM_OUTER = 31;

export function randomColor(): string {
    const h = Math.floor(Math.random() * 360);
    const s = 60 + Math.floor(Math.random() * 20); // 60–80% saturation  
    const l = 55 + Math.floor(Math.random() * 15); // 55–70% lightness  
    const sl = s / 100, ll = l / 100;
    const a = sl * Math.min(ll, 1 - ll);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function expandSectors(sectors: Sector[]): Sector[] {
    const result: Sector[] = [];
    for (const sector of sectors) {
        const [sh, sm] = sector.start.split(':').map(Number);
        const [eh, em] = sector.end.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;

        if (endMins < startMins && endMins !== 0) {
            result.push({ ...sector, end: '00:00' });
        } else if (startMins < 12 * 60 && endMins > 12 * 60) {
            result.push({ ...sector, end: '12:00' });
            result.push({ ...sector, start: '12:00' });
        } else {
            result.push(sector);
        }
    }
    return result;
}

// #endregion 

function buildDynamicGroup(
    handAngle: number,
    visibleSectors: Sector[],
    use12h: boolean,
    now: Date
): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    g.setAttribute('id', 'sectograph-dynamic');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    g.appendChild(defs);
    const timerTexts: Element[] = [];

    // --- Countdown arc ---  
    const normHand = handAngle < -90 ? handAngle + 360 : handAngle;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nextSector = visibleSectors.find(s => {
        const [sh, sm] = s.start.split(':').map(Number);
        return (sh * 60 + sm) > nowMinutes;
    });
    if (nextSector) {
        const [bH, bM] = nextSector.start.split(':').map(Number);
        const bMinutes = bH * 60 + bM;
        const gapEnd = timeToAngle(nextSector.start, use12h);
        if (gapEnd > normHand) {                                    
            const r = 53, hw = 4;
            const startAngle = normHand, endAngle = gapEnd;   
            const arcSpan = endAngle - startAngle;
            const arcLength = (arcSpan / 360) * 2 * Math.PI * r;
            const fullFontSize = 6;
            const isScaling = arcLength < fullFontSize * 2;
            const fontSize = isScaling ? Math.max(5, arcLength / 1.1) : fullFontSize;
            const colorB = nextSector.color ?? COLORS[visibleSectors.indexOf(nextSector) % COLORS.length];
            const countGradId = 'countdown-grad';
            const gStart = polarToCartesian(100, 100, r, startAngle);
            const gEnd = polarToCartesian(100, 100, r, endAngle);
            makeGradient(defs, countGradId, gStart.x, gStart.y, gEnd.x, gEnd.y, red, colorB);
            const countPath = makePath(makeArcPath(r + hw, r - hw, startAngle, endAngle), `url(#${countGradId})`, '0.6');
            if (!isScaling) g.appendChild(countPath);
            const diffMinutes = bMinutes - nowMinutes;
            const dh = Math.floor(diffMinutes / 60), dm = diffMinutes % 60;
            const timerLabel = dh > 0 ? (dm > 0 ? `${dh}:${String(dm).padStart(2, '0')}` : `${dh}h`) : `${dm}m`;
            const midAngle = (startAngle + endAngle) / 2;
            const midPos = polarToCartesian(100, 100, r, midAngle);
            let textAngle = midAngle + 90;
            if (midAngle > 0 && midAngle < 180) textAngle += 180;
            if (arcLength > 0) {
                if (!isScaling) {
                    const textWidth = fontSize * 0.6 * timerLabel.length + 4;
                    const halfSpan = (textWidth / (2 * Math.PI * r)) * 360;
                    const bgPath = makePath(makeArcPath(r + hw, r - hw, midAngle - halfSpan / 2, midAngle + halfSpan / 2), BGcolor);
                    bgPath.setAttribute('stroke', BGcolor); bgPath.setAttribute('stroke-width', '2');
                    g.appendChild(bgPath);
                }
                const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                lbl.setAttribute('x', String(midPos.x)); lbl.setAttribute('y', String(midPos.y));
                lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('dominant-baseline', 'central');
                lbl.setAttribute('font-size', String(fontSize));
                lbl.setAttribute('fill', `url(#${countGradId})`);
                lbl.setAttribute('stroke', BGcolor); lbl.setAttribute('stroke-width', '2');
                lbl.setAttribute('font-weight', 'bold'); lbl.setAttribute('paint-order', 'stroke');
                lbl.setAttribute('transform', `rotate(${textAngle}, ${midPos.x}, ${midPos.y})`);
                lbl.textContent = timerLabel;
                timerTexts.push(lbl);
            }
        }
    }

    // --- Clock hand ---  
    const tip = polarToCartesian(100, 100, ((INNER_R + ARC_R) / 2) + 1.5, handAngle);
    const base = polarToCartesian(100, 100, INNER_R + 1, handAngle);
    const hand = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hand.setAttribute('x1', String(base.x)); hand.setAttribute('y1', String(base.y));
    hand.setAttribute('x2', String(tip.x)); hand.setAttribute('y2', String(tip.y));
    hand.setAttribute('stroke', red); hand.setAttribute('stroke-width', '3');
    hand.setAttribute('stroke-linecap', 'square');
    g.appendChild(hand);
    const startR = INNER_R + 5, endR = TICK_R + 4, dashW = 2, dashH = 2.9, dashStep = dashW + 2;
    for (let r = startR; r < endR; r += dashStep) {
        const pos = polarToCartesian(100, 100, r, handAngle);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(pos.x - dashW / 2)); rect.setAttribute('y', String(pos.y - dashH / 2));
        rect.setAttribute('width', String(dashW)); rect.setAttribute('height', String(dashH));
        rect.setAttribute('fill', red);
        rect.setAttribute('transform', `rotate(${handAngle}, ${pos.x}, ${pos.y})`);
        rect.setAttribute('opacity', '0.3');
        g.appendChild(rect);
    }
    const ballPos = polarToCartesian(100, 100, 90, handAngle);
    const ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ball.setAttribute('cx', String(ballPos.x)); ball.setAttribute('cy', String(ballPos.y));
    ball.setAttribute('r', '4'); ball.setAttribute('fill', red);
    ball.setAttribute('id', 'sectograph-ball');
    g.appendChild(ball);

    // --- Digital clock ---  
    const dig = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dig.setAttribute('cx', '100'); dig.setAttribute('cy', '100');
    dig.setAttribute('r', '26'); dig.setAttribute('fill', 'black');
    g.appendChild(dig);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const digitalTime = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    digitalTime.setAttribute('x', '100'); digitalTime.setAttribute('y', '97');
    digitalTime.setAttribute('text-anchor', 'middle'); digitalTime.setAttribute('dominant-baseline', 'central');
    digitalTime.setAttribute('font-size', '13'); digitalTime.setAttribute('class', 'sectograph-digital-time');
    digitalTime.textContent = `${hh}:${mm}`;
    g.appendChild(digitalTime);
    const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const digitalDate = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    digitalDate.setAttribute('x', '100'); digitalDate.setAttribute('y', '108');
    digitalDate.setAttribute('text-anchor', 'middle'); digitalDate.setAttribute('dominant-baseline', 'central');
    digitalDate.setAttribute('font-size', '10'); digitalDate.setAttribute('class', 'sectograph-digital-date');
    digitalDate.textContent = `${DAY_NAMES[now.getDay()]} ${now.getDate()}`;
    g.appendChild(digitalDate);

    for (const el of timerTexts) g.appendChild(el);
    return g;
}

function renderTimeframeRim(
    svg: SVGSVGElement,
    use12h: boolean,
    showPM: boolean,
    timeframes: Record<string, { start: string; end: string }>
): void {
    const windowStart = use12h ? (showPM ? 12 : 0) : 0;
    const windowEnd = use12h ? windowStart + 12 : 24;

    const TF_ORDER = ['morning', 'afternoon', 'evening', 'night'] as const;

    for (const key of TF_ORDER) {
        const tf = timeframes[key];
        if (!tf) continue;

        let [sh, sm] = tf.start.split(':').map(Number);
        let [eh, em] = tf.end.split(':').map(Number);
        let tfStartMins = sh * 60 + sm;
        let tfEndMins = eh * 60 + em;

        // Handle midnight wrap (e.g. evening 17:00–00:00)  
        if (tfEndMins <= tfStartMins) tfEndMins += 24 * 60;

        // Clip to the visible window  
        const winStartMins = windowStart * 60;
        const winEndMins = windowEnd * 60;
        const clippedStart = Math.max(tfStartMins, winStartMins);
        const clippedEnd = Math.min(tfEndMins, winEndMins);
        if (clippedEnd <= clippedStart) continue;

        // Convert to angles  
        const startAngle = ((clippedStart - winStartMins) / ((winEndMins - winStartMins))) * 360 - 90;
        const endAngle = ((clippedEnd - winStartMins) / ((winEndMins - winStartMins))) * 360 - 90;

        const color = TIMEFRAME_COLORS[key] ?? '#888888';
        const path = makePath(
            makeArcPath(TIMEFRAME_RIM_OUTER, TIMEFRAME_RIM_INNER, startAngle, endAngle),
            color,
            '1.00'
        );
        svg.appendChild(path);

        const p1 = polarToCartesian(100, 100, TIMEFRAME_RIM_INNER, startAngle);
        const p2 = polarToCartesian(100, 100, TIMEFRAME_RIM_OUTER, startAngle);
        const divLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        divLine.setAttribute('x1', String(p1.x));
        divLine.setAttribute('y1', String(p1.y));
        divLine.setAttribute('x2', String(p2.x));
        divLine.setAttribute('y2', String(p2.y));
        divLine.setAttribute('stroke', 'white');
        divLine.setAttribute('stroke-width', '1');
        divLine.setAttribute('opacity', '1.0');
        svg.appendChild(divLine);  

        // Curved text label  
        const labelRadius = (TIMEFRAME_RIM_OUTER + TIMEFRAME_RIM_INNER) / 2; // = 29  
        const midAngle = (startAngle + endAngle) / 2;
        const arcLength = ((endAngle - startAngle) / 360) * 2 * Math.PI * labelRadius;
        const TF_LABELS: Record<string, string> = {
            morning: 'MORNING',
            afternoon: 'AFTERNOON',
            evening: 'EVENING',
            night: '🌙',
        };
        const label = TF_LABELS[key] ?? key.toUpperCase();
        const fontSize = 3.2;
        const approxTextWidth = label.length * fontSize * 0.65;

        if (arcLength > approxTextWidth * 1.5) {
            const isBottomHalf = midAngle > 90 && midAngle < 270;
            const arcData = makeSimpleArcPath(labelRadius, startAngle, endAngle, isBottomHalf);

            let defs = svg.querySelector('defs') as SVGDefsElement | null;
            if (!defs) {
                defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs') as SVGDefsElement;
                svg.insertBefore(defs, svg.firstChild);
            }

            const pathId = `tf-label-path-${key}`;
            const old = defs.querySelector(`#${pathId}`);
            if (old) defs.removeChild(old);

            const arcEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arcEl.setAttribute('id', pathId);
            arcEl.setAttribute('d', arcData);
            arcEl.setAttribute('fill', 'none');
            defs.appendChild(arcEl);

            const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textEl.setAttribute('font-size', String(fontSize));
            textEl.setAttribute('fill', '#ffffff');
            textEl.setAttribute('opacity', '1.0');
            textEl.setAttribute('font-weight', '600');
            textEl.setAttribute('letter-spacing', '0.4');

            const textPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
            textPath.setAttribute('href', `#${pathId}`);
            textPath.setAttribute('startOffset', '50%');
            textPath.setAttribute('text-anchor', 'middle');
            textPath.setAttribute('dominant-baseline', 'central');
            textPath.textContent = label;

            textEl.appendChild(textPath);
            svg.appendChild(textEl);
        }
    }
}

export function renderClock(
    container: Element,
    sectors: Sector[],
    use12h: boolean,
    showPM: boolean,
    overrideAngle?: number,
    timeframes?: Record<string, { start: string; end: string }>
): void {
    // #region start renderclock
    sectors = sectors.filter(s => s.start && s.end);
    const isPM = use12h ? showPM : new Date().getHours() >= 12;
    const windowStart = isPM ? 12 : 0;

    const visibleSectors = (use12h
        ? expandSectors(sectors).filter(s => {
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
    const handAngle = overrideAngle ?? timeToAngle(`${hh}:${mm}`, use12h);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sectograph-clock');
    svg.setAttribute('width', '100%');
    svg.setAttribute('viewBox', '0 0 200 200');
    // #endregion  

    // #region Clock face  

    const face = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    face.setAttribute('cx', '100'); face.setAttribute('cy', '100'); face.setAttribute('r', '90');
    face.setAttribute('fill', BGcolor);
    face.setAttribute('stroke', '#888'); face.setAttribute('stroke-width', '1');
    svg.appendChild(face);

    // ── Timeframe rim ──────────────────────────────────────────────────────────  
    if (timeframes) {
        renderTimeframeRim(svg, use12h, showPM, timeframes);
    }
    
    // #endregion  

    // #region Tick marks & hour labels  

    const hours = use12h ? 12 : 24;
    const subTickStep = 360 / hours / 5;

    for (let hour = 0; hour < hours; hour++) {
        const hourAngle = (hour / hours) * 360 - 90;

        // Outer hour tick  
        const outerH = polarToCartesian(100, 100, 90, hourAngle);
        const innerH = polarToCartesian(100, 100, TICK_R, hourAngle);
        const hourTick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hourTick.setAttribute('x1', String(outerH.x)); hourTick.setAttribute('y1', String(outerH.y));
        hourTick.setAttribute('x2', String(innerH.x)); hourTick.setAttribute('y2', String(innerH.y));
        hourTick.setAttribute('stroke', '#cccccc'); hourTick.setAttribute('stroke-width', '1.5');
        svg.appendChild(hourTick);

        // Inner hour tick  
        const outerH2 = polarToCartesian(100, 100, 34, hourAngle);
        const innerH2 = polarToCartesian(100, 100, 58, hourAngle);
        const hourTick2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hourTick2.setAttribute('x1', String(outerH2.x)); hourTick2.setAttribute('y1', String(outerH2.y));
        hourTick2.setAttribute('x2', String(innerH2.x)); hourTick2.setAttribute('y2', String(innerH2.y));
        hourTick2.setAttribute('stroke', '#363636'); hourTick2.setAttribute('stroke-width', '0.5');
        svg.appendChild(hourTick2);

        // Hour number / sun / moon icon  
        const labelPos = polarToCartesian(100, 100, HRS_R, hourAngle);
        const showMoon = (use12h && hour === 0 && isPM) || (!use12h && hour === 12);
        const showSun = (use12h && hour === 0 && !isPM) || (!use12h && hour === 0);

        if (showSun || showMoon) {
            const iconSize = 10;
            const scale = iconSize / 18;
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('transform',
                `translate(${labelPos.x}, ${labelPos.y}) scale(${scale}) translate(-12, -12)`);

            if (showMoon) {
                const moonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                moonPath.setAttribute('d', 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401');
                moonPath.setAttribute('fill', '#cccccc'); moonPath.setAttribute('stroke', 'none');
                g.appendChild(moonPath);
            } else {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12');
                circle.setAttribute('r', '6');
                circle.setAttribute('fill', '#cccccc'); circle.setAttribute('stroke', 'none');
                g.appendChild(circle);

                for (const d of ['M12 3v1', 'M12 20v1', 'm4.93 4.93 0.7 0.7', 'm17.66 17.66 0.7 0.7',
                    'M3 12h1', 'M20 12h1', 'm6.34 17.66-0.7 0.7', 'm19.07 4.93-0.7 0.7']) {
                    const ray = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    ray.setAttribute('d', d); ray.setAttribute('fill', 'none');
                    ray.setAttribute('stroke', '#cccccc'); ray.setAttribute('stroke-width', '2');
                    ray.setAttribute('stroke-linecap', 'round');
                    g.appendChild(ray);
                }
            }
            svg.appendChild(g);
        } else {
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', String(labelPos.x)); label.setAttribute('y', String(labelPos.y));
            label.setAttribute('text-anchor', 'middle'); label.setAttribute('dominant-baseline', 'central');
            label.setAttribute('font-size', '9'); label.setAttribute('class', 'sectograph-hour-label');
            label.textContent = use12h
                ? (isPM ? String(12 + hour) : String(hour).padStart(2, '0'))
                : String(hour);
            svg.appendChild(label);
        }

        // Sub-ticks (4 per hour)  
        for (let sub = 1; sub <= 4; sub++) {
            const subAngle = hourAngle + sub * subTickStep;
            const outerS = polarToCartesian(100, 100, 90, subAngle);
            const innerS = polarToCartesian(100, 100, TICK_R + 4, subAngle);
            const subTick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            subTick.setAttribute('x1', String(outerS.x)); subTick.setAttribute('y1', String(outerS.y));
            subTick.setAttribute('x2', String(innerS.x)); subTick.setAttribute('y2', String(innerS.y));
            subTick.setAttribute('stroke', '#666666'); subTick.setAttribute('stroke-width', '0.5');
            svg.appendChild(subTick);
        }
    }

    const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    const timerTexts: Element[] = [];

    // #endregion 

    // #region Transition arcs  

    for (let i = 0; i < visibleSectors.length - 1; i++) {
        const sectorA = visibleSectors[i];
        const sectorB = visibleSectors[i + 1];
        const startAngle = timeToAngle(sectorA.end, use12h);
        const endAngle = timeToAngle(sectorB.start, use12h);

        if (endAngle < startAngle) continue;

        // Skip split-sector boundary edges  
        if (use12h) {
            const [aEH, aEM] = sectorA.end.split(':').map(Number);
            const boundaryMins = ((windowStart + 12) * 60) % (24 * 60);
            if (aEH * 60 + aEM === boundaryMins) continue;
        }

        const r = 40, hw = 6;

        const colorA = sectorA.color ?? COLORS[i % COLORS.length];
        const colorB = sectorB.color ?? COLORS[(i + 1) % COLORS.length];
        const gradId = `trans-grad-${i}`;
        const gStart = polarToCartesian(100, 100, r, startAngle);
        const gEnd = polarToCartesian(100, 100, r, endAngle);
        makeGradient(defs, gradId, gStart.x, gStart.y, gEnd.x, gEnd.y, colorA, colorB);

        const arcSpan = endAngle - startAngle;
        const arcLength = (arcSpan / 360) * 2 * Math.PI * r;
        const fullFontSize = 7;
        const isScaling = arcLength < fullFontSize * 2;
        const fontSize = isScaling ? Math.max(2, arcLength / 2) : fullFontSize;

        const path = makePath(makeArcPath(r + hw, r - hw, startAngle, endAngle), `url(#${gradId})`, OPAC);
        if (!isScaling) svg.appendChild(path);

        // Gap duration label  
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
                const textWidth = fontSize * 0.6 * gapLabel.length + 4;
                const halfSpan = (textWidth / (2 * Math.PI * r)) * 360;
                const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                bgPath.setAttribute('d', makeArcPath(r + hw, r - hw, midAngle - halfSpan / 2, midAngle + halfSpan / 2));
                bgPath.setAttribute('fill', BGcolor);
                bgPath.setAttribute('stroke', BGcolor); bgPath.setAttribute('stroke-width', '2');
                svg.appendChild(bgPath);
            }

            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', String(midPos.x)); txt.setAttribute('y', String(midPos.y - 1));
            txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
            txt.setAttribute('font-size', String(fontSize));
            txt.setAttribute('fill', `url(#${gradId})`);
            txt.setAttribute('font-weight', 'bold');
            txt.setAttribute('stroke', BGcolor); txt.setAttribute('stroke-width', '2');
            txt.setAttribute('paint-order', 'stroke');
            txt.setAttribute('transform', `rotate(${textAngle}, ${midPos.x}, ${midPos.y})`);
            txt.textContent = gapLabel;
            timerTexts.push(txt);
        }
    }

    // #endregion  

    // #region Sector arcs  

    visibleSectors.forEach((sector, index) => {
        let startAngle = timeToAngle(sector.start, use12h);
        let endAngle = timeToAngle(sector.end, use12h);
        if (endAngle < startAngle) endAngle += 360;

        const path = makePath(makeArcPath(90, INNER_R, startAngle, endAngle), sector.color ?? COLORS[index % COLORS.length], OPAC);
        svg.appendChild(path);

        // Sector name label — radial, readable orientation  
        const midAngle = (startAngle + endAngle) / 2;
        const labelPos = polarToCartesian(100, 100, 55, midAngle);
        let sectorTextAngle = midAngle;
        if (midAngle > 90 && midAngle < 270) sectorTextAngle += 180;

        const sectorLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        sectorLabel.setAttribute('x', String(labelPos.x));
        sectorLabel.setAttribute('y', String(labelPos.y));
        sectorLabel.setAttribute('text-anchor', 'middle');
        sectorLabel.setAttribute('dominant-baseline', 'central');
        sectorLabel.setAttribute('font-size', '6');
        sectorLabel.setAttribute('fill', '#ffffff');
        sectorLabel.setAttribute('transform', `rotate(${sectorTextAngle}, ${labelPos.x}, ${labelPos.y})`);
        sectorLabel.textContent = sector.title;
        timerTexts.push(sectorLabel);

        // Thin arc + duration label (hover only)  
        const THIN_R = 77;   // midpoint of 76–78  
        const THIN_HW = 1;
        const lblTime = 74;

        const [sh, sm] = sector.start.split(':').map(Number);
        const [eh, em] = sector.end.split(':').map(Number);
        let durationMins = (eh * 60 + em) - (sh * 60 + sm);
        if (durationMins <= 0) durationMins += 1440;
        const dh = Math.floor(durationMins / 60);
        const dm = durationMins % 60;
        const durationLabel = dh > 0 ? (dm > 0 ? `${dh}h${dm}` : `${dh}h`) : `${dm}m`;

        const fontSize = 5;
        const labelArcLength = durationLabel.length * fontSize * 0.5;
        const labelSpan = (labelArcLength / (2 * Math.PI * lblTime)) * 360;
        const arcEndAngle = endAngle - labelSpan;

        const hoverEls: Array<[SVGElement, string]> = [];

        if (arcEndAngle > startAngle) {
            const thinPath = makePath(
                makeArcPath(THIN_R + THIN_HW, THIN_R - THIN_HW, startAngle, arcEndAngle),
                thinPathCL
            );
            thinPath.style.opacity = '0';
            thinPath.style.pointerEvents = 'none';
            thinPath.style.transition = 'opacity 0.2s ease';
            svg.appendChild(thinPath);
            hoverEls.push([thinPath as SVGElement, '0.5']);
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
        lbl.setAttribute('fill', thinPathCL);
        lbl.setAttribute('font-weight', '500');
        lbl.setAttribute('transform', `rotate(${labelTextAngle}, ${lblPos.x}, ${lblPos.y})`);
        lbl.textContent = durationLabel;
        lbl.style.opacity = '0';
        lbl.style.pointerEvents = 'none';
        lbl.style.transition = 'opacity 0.2s ease';
        timerTexts.push(lbl);
        hoverEls.push([lbl as SVGElement, '0.5']);

        path.addEventListener('mouseover', () => {
            hoverEls.forEach(([el, target]) => {
                el.style.opacity = target;
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

    // #endregion  

    // #region Rim  

    const rim = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rim.setAttribute('cx', '100');
    rim.setAttribute('cy', '100');
    rim.setAttribute('r', String((90 + ARC_R) / 2));
    rim.setAttribute('fill', 'none');
    rim.setAttribute('stroke', RIMcolor);
    rim.setAttribute('opacity', '0.3');
    rim.setAttribute('stroke-width', String(90 - ARC_R));
    svg.appendChild(rim);

    // #endregion  

    // Static timer texts (sector labels, transition labels, hover labels)  
    for (const el of timerTexts) svg.appendChild(el);

    // Dynamic group — appended last so it renders above everything  
    svg.appendChild(buildDynamicGroup(handAngle, visibleSectors, use12h, now));

    const existing = container.firstElementChild;
    if (existing) {
        container.replaceChild(svg, existing);
    } else {
        container.appendChild(svg);
    }
}

export function updateClockHand(
    container: Element,
    sectors: Sector[],
    use12h: boolean,
    showPM: boolean,
    overrideAngle?: number,
    viewDate?: string
): void {
    const svg = container.querySelector('svg');
    if (!svg) return;

    const isPM = use12h ? showPM : new Date().getHours() >= 12;
    const windowStart = isPM ? 12 : 0;
    sectors = sectors.filter(s => s.start && s.end);
    const visibleSectors = (use12h
        ? expandSectors(sectors).filter(s => {
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

    let now = new Date();
    if (viewDate) {
        const [y, mo, d] = viewDate.split('-').map(Number);
        now = new Date(y, mo - 1, d, now.getHours(), now.getMinutes());
    }
    const handAngle = overrideAngle ?? timeToAngle(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        use12h
    );
    if (overrideAngle !== undefined) {
        const { h, m } = angleToHoursMinutes(overrideAngle, use12h, showPM);
        now = new Date(now);
        now.setHours(h, m, 0, 0);
    }

    const old = svg.querySelector('#sectograph-dynamic');
    if (old) svg.removeChild(old);
    svg.appendChild(buildDynamicGroup(handAngle, visibleSectors, use12h, now));
}