import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The Huishouden UI primitives for React apps (DESIGN.md "Components"): class strings for buttons,
 * inputs and cards, and the dialog, chip, field, toast-with-Undo, error notice, status pill,
 * checkbox, section tabs and member badge every app shows.
 *
 * Styled with Tailwind v4 on the kit's palette: import `@huishouden/pwa-kit/tailwind.css` after
 * `tailwindcss` in the app's stylesheet. It maps the theme (forest, cream, terracotta) and adds
 * these files to Tailwind's sources. Icons are lucide-react, like the apps'.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { personColour, personInitial, personName } from '../people';
export const inputClass = 'w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200';
/** A select styled like the inputs. */
export const selectClass = `${inputClass} appearance-auto`;
export const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-700 px-4 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-forest-600 disabled:opacity-50';
export const ghostButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-100';
/** The second action next to a primary button. */
export const secondaryButton = `${ghostButton} border border-stone-200 bg-white disabled:opacity-50`;
export const iconButton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-600 transition-colors duration-150 hover:bg-stone-100 disabled:opacity-30';
/** Footer button that deletes; the destructive action stays quiet until asked for. */
export const deleteButton = 'mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-red-700 hover:bg-stone-100';
export const cardClass = 'rounded-2xl border border-stone-200 bg-white shadow-sm';
export const overline = 'text-xs font-semibold uppercase tracking-wide text-stone-600';
/** A text link with a 44px target: phone numbers, Open in Google Maps, Open in Calendar. */
export const linkClass = '-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium text-forest-700 underline-offset-4 transition-colors duration-150 hover:bg-forest-50 hover:underline';
export function Chip({ active, onClick, children, label }) {
    return (_jsx("button", { type: "button", onClick: onClick, "aria-pressed": active, "aria-label": label, className: `inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${active ? 'border-forest-700 bg-forest-700 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-forest-400'}`, children: children }));
}
/**
 * A dialog: bottom sheet on phones, centred on tablets; title and close row; Escape and the scrim
 * close it; the first field (or button) takes focus.
 */
export function Dialog({ title, onClose, children, footer }) {
    const panel = useRef(null);
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        panel.current?.querySelector('input, select, textarea, button:not([aria-label="Close"])')?.focus();
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6", onClick: onClose, children: _jsxs("div", { ref: panel, role: "dialog", "aria-modal": "true", "aria-label": title, className: "safe-bottom max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "mb-5 flex items-center justify-between gap-4", children: [_jsx("h2", { className: "text-xl font-semibold text-stone-800", children: title }), _jsx("button", { type: "button", onClick: onClose, className: iconButton, "aria-label": "Close", children: _jsx(X, { size: 20 }) })] }), children, footer && _jsx("div", { className: "mt-6 flex flex-wrap items-center justify-end gap-2", children: footer })] }) }));
}
export function Field({ label, children, hint }) {
    return (_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1.5 block text-sm font-medium text-stone-700", children: label }), children, hint && _jsx("span", { className: "mt-1 block text-sm text-stone-600", children: hint })] }));
}
export function Checkbox({ checked, onChange, children }) {
    return (_jsxs("label", { className: "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-base text-stone-800", children: [_jsx("input", { type: "checkbox", className: "h-5 w-5 shrink-0 accent-forest-700", checked: checked, onChange: (e) => onChange(e.target.checked) }), _jsx("span", { className: "min-w-0", children: children })] }));
}
/** "Overdue" and "Soon" labels; nothing for the rest, so the eye goes to what needs doing. */
export function StatusPill({ state }) {
    if (state === 'overdue')
        return _jsx("span", { className: "inline-flex shrink-0 items-center rounded-full bg-terracotta-light px-2.5 py-0.5 text-sm font-semibold text-terracotta-dark", children: "Overdue" });
    if (state === 'soon')
        return _jsx("span", { className: "inline-flex shrink-0 items-center rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-sm font-semibold text-stone-700", children: "Soon" });
    return null;
}
/** A failed action in words, with Try again. */
export function ErrorNotice({ message, onRetry }) {
    return (_jsxs("div", { role: "alert", className: "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-red-50 px-3 py-2 text-base text-red-700", children: [_jsx("span", { className: "min-w-0 flex-1", children: message }), _jsx("button", { type: "button", className: "min-h-11 rounded-xl px-3 font-semibold underline-offset-4 hover:underline", onClick: onRetry, children: "Try again" })] }));
}
/**
 * The app's sections as a segmented control, for the app bar's `nav` slot:
 * `<AppBar …><SectionTabs tabs={…} tab={tab} onTab={setTab} /></AppBar>`. `compact` tightens the
 * spacing on phones for five or more tabs.
 */
export function SectionTabs({ tabs, tab, onTab, compact }) {
    if (tabs.length === 0)
        return null;
    return (_jsx("nav", { slot: "nav", "aria-label": "Sections", className: `flex w-full overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1 sm:w-auto ${compact ? 'gap-0.5 sm:gap-1' : 'gap-1'}`, children: tabs.map((t) => (_jsx("button", { type: "button", onClick: () => onTab(t.id), "aria-current": t.id === tab ? 'page' : undefined, className: `min-h-11 flex-1 rounded-xl text-sm font-medium whitespace-nowrap transition-colors duration-150 sm:flex-none sm:px-5 sm:text-base ${compact ? 'px-1' : 'px-2'} ${t.id === tab ? 'bg-forest-700 text-white' : 'text-stone-600 hover:bg-stone-100'}`, children: t.label }, t.id))) }));
}
/** A member's initial on their colour, for "logged by" marks. */
export function PersonBadge({ email, me, members, size = 32 }) {
    const name = personName(email, { email: me });
    return (_jsx("span", { className: "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", style: { width: size, height: size, backgroundColor: personColour(email, members), fontSize: size * 0.42 }, title: `Logged by ${name}`, "aria-label": `Logged by ${name}`, role: "img", children: personInitial(email) }));
}
/** One toast at a time: `notify` (with an optional Undo), `fail` (an error), `clear`. Pair with `<Toast>`. */
export function useToast() {
    const [toast, setToast] = useState(null);
    const notify = useCallback((message, undo) => setToast({ id: Date.now(), message, tone: 'info', undo }), []);
    const fail = useCallback((message) => setToast({ id: Date.now(), message, tone: 'error' }), []);
    const clear = useCallback(() => setToast(null), []);
    return { toast, notify, fail, clear };
}
/** The toast at the bottom: 6 seconds for news, 9 for errors; Undo runs and dismisses it. */
export function Toast({ toast, onDone }) {
    useEffect(() => {
        if (!toast)
            return;
        const id = setTimeout(onDone, toast.tone === 'error' ? 9000 : 6000);
        return () => clearTimeout(id);
    }, [toast, onDone]);
    return (_jsx("div", { "aria-live": "polite", className: "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]", children: toast && (_jsxs("div", { className: `pointer-events-auto flex min-h-14 max-w-xl items-center gap-4 rounded-2xl px-5 py-2 text-base font-medium text-white shadow-lg ${toast.tone === 'error' ? 'bg-red-700' : 'bg-stone-800'}`, children: [_jsx("span", { children: toast.message }), toast.undo && (_jsx("button", { type: "button", onClick: () => {
                        toast.undo?.();
                        onDone();
                    }, className: "min-h-11 rounded-xl px-3 font-semibold text-forest-200 underline-offset-4 hover:underline", children: "Undo" }))] })) }));
}
