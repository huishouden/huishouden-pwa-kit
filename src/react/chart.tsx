/**
 * `QuantityChart`: a small line chart of one quantity over time, with an optional dashed target
 * line (a pet's weight against the vet's goal; a baby's growth). Draws nothing with fewer than two
 * points. The y labels show the rounded range; the dates of the first and last point sit under it.
 *
 * ```tsx
 * <QuantityChart label="Weight" points={weights.map((w) => ({ at: w.at, value: w.kg }))} target={goal} format={(v) => `${v.toFixed(1)} kg`} />
 * ```
 */
import { lineChart, type ChartPoint } from '../chart.js';
import { formatDayShort } from '../time.js';

const W = 560;
const H = 150;
const PAD = 14;

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

export function QuantityChart({ label, points, format, target, step }: QuantityChartProps) {
  const g = lineChart(points, { width: W, height: H, pad: PAD, target, step });
  if (!g || g.points.length < 2) return null;
  const first = g.points[0];
  const last = g.points.at(-1)!;
  return (
    <figure className="mt-3">
      <div className="flex gap-2">
        <div className="flex w-12 shrink-0 flex-col justify-between py-1 text-right text-xs text-muted tabular-nums" aria-hidden="true">
          <span>{g.max.toFixed(1)}</span>
          <span>{g.min.toFixed(1)}</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-36 w-full min-w-0"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label} from ${format(first.value)} on ${formatDayShort(first.at)} to ${format(last.value)} on ${formatDayShort(last.at)}${target ? `; target ${format(target)}` : ''}`}
        >
          <line x1="0" x2={W} y1={PAD} y2={PAD} className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={W} y1={H - PAD} y2={H - PAD} className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {g.targetY !== undefined && (
            <line
              x1="0"
              x2={W}
              y1={g.targetY}
              y2={g.targetY}
              className="stroke-stone-500 dark:stroke-stone-400"
              strokeWidth="1.5"
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
              data-testid="chart-target-line"
            />
          )}
          <path d={g.path} fill="none" className="stroke-forest-600 dark:stroke-forest-300" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {/* Dots drawn in HTML so they stay round when the chart stretches. */}
      <div className="relative -mt-36 ml-14 h-36" aria-hidden="true">
        {g.targetY !== undefined && target !== undefined && (
          <span className="absolute right-0 -translate-y-full pb-0.5 text-xs font-medium text-muted" style={{ top: `${(g.targetY / H) * 100}%` }}>
            Target {format(target)}
          </span>
        )}
        {g.points.map((p) => (
          <span
            key={p.at}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-forest-600 dark:bg-forest-300"
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
          />
        ))}
      </div>
      <figcaption className="mt-1 ml-14 flex justify-between text-xs text-muted">
        <span>{formatDayShort(first.at)}</span>
        <span>{formatDayShort(last.at)}</span>
      </figcaption>
    </figure>
  );
}
