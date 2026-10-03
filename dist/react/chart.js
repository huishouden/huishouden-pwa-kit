import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * `QuantityChart`: a small line chart of one quantity over time, with an optional dashed target
 * line (a pet's weight against the vet's goal; a baby's growth). Draws nothing with fewer than two
 * points. The y labels show the rounded range; the dates of the first and last point sit under it.
 *
 * ```tsx
 * <QuantityChart label="Weight" points={weights.map((w) => ({ at: w.at, value: w.kg }))} target={goal} format={(v) => `${v.toFixed(1)} kg`} />
 * ```
 */
import { lineChart } from '../chart.js';
import { formatDayShort } from '../time.js';
const W = 560;
const H = 150;
const PAD = 14;
export function QuantityChart({ label, points, format, target, step }) {
    const g = lineChart(points, { width: W, height: H, pad: PAD, target, step });
    if (!g || g.points.length < 2)
        return null;
    const first = g.points[0];
    const last = g.points.at(-1);
    return (_jsxs("figure", { className: "mt-3", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "flex w-12 shrink-0 flex-col justify-between py-1 text-right text-xs text-stone-600 tabular-nums", "aria-hidden": "true", children: [_jsx("span", { children: g.max.toFixed(1) }), _jsx("span", { children: g.min.toFixed(1) })] }), _jsxs("svg", { viewBox: `0 0 ${W} ${H}`, className: "h-36 w-full min-w-0", preserveAspectRatio: "none", role: "img", "aria-label": `${label} from ${format(first.value)} on ${formatDayShort(first.at)} to ${format(last.value)} on ${formatDayShort(last.at)}${target ? `; target ${format(target)}` : ''}`, children: [_jsx("line", { x1: "0", x2: W, y1: PAD, y2: PAD, stroke: "#e7e5e4", strokeWidth: "1", vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: "0", x2: W, y1: H - PAD, y2: H - PAD, stroke: "#e7e5e4", strokeWidth: "1", vectorEffect: "non-scaling-stroke" }), g.targetY !== undefined && (_jsx("line", { x1: "0", x2: W, y1: g.targetY, y2: g.targetY, stroke: "#78716c", strokeWidth: "1.5", strokeDasharray: "6 5", vectorEffect: "non-scaling-stroke", "data-testid": "chart-target-line" })), _jsx("path", { d: g.path, fill: "none", stroke: "#2d6a4f", strokeWidth: "2.5", strokeLinejoin: "round", strokeLinecap: "round", vectorEffect: "non-scaling-stroke" })] })] }), _jsxs("div", { className: "relative -mt-36 ml-14 h-36", "aria-hidden": "true", children: [g.targetY !== undefined && target !== undefined && (_jsxs("span", { className: "absolute right-0 -translate-y-full pb-0.5 text-xs font-medium text-stone-600", style: { top: `${(g.targetY / H) * 100}%` }, children: ["Target ", format(target)] })), g.points.map((p) => (_jsx("span", { className: "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-600", style: { left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` } }, p.at)))] }), _jsxs("figcaption", { className: "mt-1 ml-14 flex justify-between text-xs text-stone-600", children: [_jsx("span", { children: formatDayShort(first.at) }), _jsx("span", { children: formatDayShort(last.at) })] })] }));
}
