/**
 * The geometry of a small line chart of one quantity over time: a pet's weight, a baby's length.
 * x by time, y by value, with the y range padded so a steady value doesn't look like a cliff and an
 * optional target inside it. Pure; `./react/chart` draws it.
 */

export interface ChartPoint {
  at: number;
  value: number;
}

export interface ChartOptions {
  width: number;
  height: number;
  /** Space kept clear inside each edge (default 8). */
  pad?: number;
  /** A goal to draw as a line; kept inside the range. */
  target?: number;
  /** The y bounds are rounded out to a multiple of this (default 0.5). */
  step?: number;
  /** The least padding above and below the values, in their unit (default 0.5). */
  minMargin?: number;
}

export interface ChartGeometry {
  /** Oldest first, rounded to 0.1. */
  points: { x: number; y: number; at: number; value: number }[];
  /** Rounded bounds of the y axis. */
  min: number;
  max: number;
  /** SVG path through the points. */
  path: string;
  /** The y of the target line, when there is a target. */
  targetY?: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Null without points; one point sits in the middle. */
export function lineChart(points: readonly ChartPoint[], { width, height, pad = 8, target, step = 0.5, minMargin = 0.5 }: ChartOptions): ChartGeometry | null {
  const s = [...points].sort((a, b) => a.at - b.at);
  if (s.length === 0) return null;
  const values = [...s.map((p) => p.value), ...(target ? [target] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const margin = Math.max((hi - lo) * 0.25, hi * 0.03, minMargin);
  const min = Math.floor((lo - margin) / step) * step;
  const max = Math.ceil((hi + margin) / step) * step;
  const t0 = s[0].at;
  const t1 = s.at(-1)!.at;
  const x = (t: number) => (t1 === t0 ? width / 2 : pad + ((t - t0) / (t1 - t0)) * (width - 2 * pad));
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (height - 2 * pad);
  const out = s.map((p) => ({ x: round(x(p.at)), y: round(y(p.value)), at: p.at, value: p.value }));
  const path = out.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  return { points: out, min, max, path, ...(target ? { targetY: round(y(target)) } : {}) };
}
