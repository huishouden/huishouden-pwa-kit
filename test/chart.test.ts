import { describe, expect, test } from 'bun:test';
import { CHART_COLOURS, CHART_COLOURS_DARK, chartColours, lineChart } from '../src/chart';

const DAY = 86_400_000;
const points = [
  { at: 3 * DAY, value: 24.6 },
  { at: 0, value: 24.2 },
  { at: 6 * DAY, value: 25 },
];

describe('lineChart', () => {
  test('oldest first, inside the padding, the range rounded out and padded', () => {
    const g = lineChart(points, { width: 300, height: 120, pad: 10 })!;
    expect(g.points.map((p) => p.x)).toEqual([10, 150, 290]);
    expect(g.min).toBe(23);
    expect(g.max).toBe(26);
    expect(g.points.every((p) => p.y >= 10 && p.y <= 110)).toBe(true);
    expect(g.path.startsWith('M10 ')).toBe(true);
    expect(g.targetY).toBeUndefined();
  });

  test('one point in the middle; none is null', () => {
    expect(lineChart(points.slice(0, 1), { width: 300, height: 120 })!.points[0].x).toBe(150);
    expect(lineChart([], { width: 300, height: 120 })).toBeNull();
  });

  test('the target is inside the range and gets a line', () => {
    const g = lineChart(points, { width: 100, height: 50, pad: 0, target: 30 })!;
    expect(g.max).toBeGreaterThanOrEqual(30);
    expect(g.targetY).toBeGreaterThanOrEqual(0);
    expect(g.targetY).toBeLessThan(g.points[2].y);
  });

  test('step rounds the bounds', () => {
    const g = lineChart([{ at: 0, value: 52 }, { at: DAY, value: 55 }], { width: 100, height: 50, step: 5, minMargin: 1 })!;
    expect(g.min % 5).toBe(0);
    expect(g.max % 5).toBe(0);
  });
});

describe('chart colours', () => {
  const lum = (hex: string) =>
    hex
      .slice(1)
      .match(/../g)!
      .map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  test('eight in both themes, the same order', () => {
    expect(CHART_COLOURS).toHaveLength(8);
    expect(CHART_COLOURS_DARK).toHaveLength(8);
    expect(chartColours(false)).toBe(CHART_COLOURS);
    expect(chartColours(true)).toBe(CHART_COLOURS_DARK);
  });

  test('every dark colour is at least 3:1 on a dark surface (forest-800)', () => {
    for (const c of CHART_COLOURS_DARK) expect(ratio(c, '#12301f')).toBeGreaterThanOrEqual(3);
  });
});
