import { describe, expect, test } from 'bun:test';
import { lineChart } from '../src/chart';

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
