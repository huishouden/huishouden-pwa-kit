import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * "Scan the label": a medicine label photo read on the device (`../dose` `readLabel`, nothing
 * uploaded or kept) and parsed (`parseDirections`); the app fills its own form from the result and
 * says what it filled. The card then shows, in this order, what was filled in (field by field),
 * what it should check (`assumptions`), the label lines it read but did not use (`unparsed`, never
 * hidden: a person must see what the form does not hold, such as a warning), the pharmacy lines it
 * left out on purpose, and the whole text it read, folded.
 *
 * ```tsx
 * <LabelScan onRead={(parsed) => {
 *   const draft = toMedCourse(parsed, { startDate: today });
 *   if (draft.name) setName(draft.name);
 *   return [draft.name && { label: 'Medicine', value: draft.name }].filter(Boolean);
 * }} />
 * ```
 */
import { useRef, useState } from 'react';
import { ScanText } from 'lucide-react';
import { parseDirections, readLabel } from '../dose';
import { useKitT } from './i18n';
import { secondaryButton } from './ui';
const defaultRead = (photo, onProgress) => window.__mockLabelText !== undefined ? Promise.resolve(window.__mockLabelText) : readLabel(photo, { onProgress });
export function LabelScan({ onRead, intro, read = defaultRead }) {
    const kt = useKitT();
    intro ??= kt('dose.scanIntro');
    const photo = useRef(null);
    const [scan, setScan] = useState({ status: 'idle' });
    const readPhoto = async (file) => {
        setScan({ status: 'reading', progress: 0 });
        try {
            const text = await read(file, (progress) => setScan({ status: 'reading', progress }));
            const parsed = parseDirections(text);
            const filled = onRead(parsed, text).filter((f) => f.value.trim());
            setScan({ status: 'done', text, filled, parsed });
        }
        catch {
            setScan({ status: 'error' });
        }
        finally {
            if (photo.current)
                photo.current.value = '';
        }
    };
    const lines = (scan.status === 'done' ? scan.text : '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
    return (_jsxs("div", { className: "space-y-3 rounded-2xl border border-line p-4", children: [_jsx("input", { ref: photo, type: "file", accept: "image/*", capture: "environment", className: "hidden", "aria-label": kt('dose.labelPhoto'), onChange: (e) => {
                    const file = e.target.files?.[0];
                    if (file)
                        void readPhoto(file);
                } }), _jsxs("button", { type: "button", className: secondaryButton, disabled: scan.status === 'reading', onClick: () => photo.current?.click(), children: [_jsx(ScanText, { size: 18 }), " ", scan.status === 'reading'
                        ? kt('dose.reading', { percent: Math.round(scan.progress * 100) })
                        : scan.status === 'done'
                            ? kt('dose.scanAgain')
                            : kt('dose.scan')] }), scan.status === 'idle' && _jsx("p", { className: "text-sm text-muted", children: intro }), scan.status === 'error' && (_jsx("p", { role: "alert", className: "text-base text-error", children: kt('dose.readError') })), scan.status === 'done' && (_jsxs("div", { role: "status", className: "space-y-3 text-base text-ink-soft", children: [scan.filled.length === 0 ? (_jsx("p", { children: kt('dose.nothingFilled') })) : (_jsxs("section", { "aria-label": kt('dose.filledSection'), children: [_jsx("p", { className: "font-medium text-link", children: kt('dose.filledCheck') }), _jsx("dl", { className: "mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm", children: scan.filled.map((f) => (_jsxs("div", { className: "contents", children: [_jsx("dt", { className: "text-muted", children: f.label }), _jsx("dd", { className: "text-ink", children: f.value })] }, f.label))) })] })), scan.parsed.assumptions.length > 0 && (_jsxs("section", { "aria-label": kt('dose.checkThese'), children: [_jsx("p", { className: "text-sm font-medium text-ink", children: kt('dose.checkThese') }), _jsx("ul", { className: "list-disc pl-5 text-sm", children: scan.parsed.assumptions.map((a) => (_jsx("li", { children: a }, a))) })] })), scan.parsed.unparsed.length > 0 && (_jsxs("section", { "aria-label": kt('dose.notUsedSection'), children: [_jsx("p", { className: "text-sm font-medium text-ink", children: kt('dose.notUsedSection') }), _jsx("p", { className: "text-sm text-muted", children: kt('dose.notUsedHelp') }), _jsx("ul", { "aria-label": kt('dose.notUsed'), className: "mt-1 list-disc pl-5 text-sm", children: scan.parsed.unparsed.map((u) => (_jsx("li", { children: u }, u))) })] })), scan.parsed.ignored.length > 0 && (_jsx("p", { className: "text-sm text-muted", children: kt('dose.leftOut', { n: scan.parsed.ignored.length }) })), lines.length > 0 && (_jsxs("details", { className: "text-sm text-muted", children: [_jsx("summary", { className: "cursor-pointer select-none py-1", children: kt('dose.everythingRead') }), _jsx("ul", { "aria-label": kt('dose.readFromPhoto'), className: "mt-1 space-y-0.5 pl-1", children: lines.map((l, i) => (_jsx("li", { children: l }, i))) })] }))] }))] }));
}
