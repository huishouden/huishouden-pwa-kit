/**
 * `QuantityChart`: a small line chart of one quantity over time, with an optional dashed target
 * line (a pet's weight against the vet's goal; a baby's growth). Draws nothing with fewer than two
 * points. The y labels show the rounded range; the dates of the first and last point sit under it.
 *
 * ```tsx
 * <QuantityChart label="Weight" points={weights.map((w) => ({ at: w.at, value: w.kg }))} target={goal} format={(v) => `${v.toFixed(1)} kg`} />
 * ```
 */
import { type ChartPoint } from '../chart.js';
export interface QuantityChartProps {
    /** What is measured, for the chart's accessible name: "Weight from 24.2 lb on 3 Mar to …". */
    label: string;
    points: readonly ChartPoint[];
    /** A value with its unit: "24.2 lb". */
    format: (value: number) => string;
    target?: number;
    /** Rounding of the y range (default 0.5). */
    step?: number;
}
export declare function QuantityChart({ label, points, format, target, step }: QuantityChartProps): import("react").JSX.Element | null;
