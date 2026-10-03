/**
 * The geometry of a small line chart of one quantity over time: a pet's weight, a baby's length.
 * x by time, y by value, with the y range padded so a steady value doesn't look like a cliff and an
 * optional target inside it. Pure; `./react/chart` draws it.
 */
const round = (n) => Math.round(n * 10) / 10;
/** Null without points; one point sits in the middle. */
export function lineChart(points, { width, height, pad = 8, target, step = 0.5, minMargin = 0.5 }) {
    const s = [...points].sort((a, b) => a.at - b.at);
    if (s.length === 0)
        return null;
    const values = [...s.map((p) => p.value), ...(target ? [target] : [])];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const margin = Math.max((hi - lo) * 0.25, hi * 0.03, minMargin);
    const min = Math.floor((lo - margin) / step) * step;
    const max = Math.ceil((hi + margin) / step) * step;
    const t0 = s[0].at;
    const t1 = s.at(-1).at;
    const x = (t) => (t1 === t0 ? width / 2 : pad + ((t - t0) / (t1 - t0)) * (width - 2 * pad));
    const y = (v) => pad + (1 - (v - min) / (max - min)) * (height - 2 * pad);
    const out = s.map((p) => ({ x: round(x(p.at)), y: round(y(p.value)), at: p.at, value: p.value }));
    const path = out.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
    return { points: out, min, max, path, ...(target ? { targetY: round(y(target)) } : {}) };
}
