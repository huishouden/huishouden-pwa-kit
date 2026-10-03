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
    points: {
        x: number;
        y: number;
        at: number;
        value: number;
    }[];
    /** Rounded bounds of the y axis. */
    min: number;
    max: number;
    /** SVG path through the points. */
    path: string;
    /** The y of the target line, when there is a target. */
    targetY?: number;
}
/** Null without points; one point sits in the middle. */
export declare function lineChart(points: readonly ChartPoint[], { width, height, pad, target, step, minMargin }: ChartOptions): ChartGeometry | null;
