import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The Huishouden UI primitives for React apps (DESIGN.md "Components"): class strings for buttons,
 * inputs and cards, and the dialog, chip, field, toast-with-Undo, error notice, status pill,
 * checkbox, section tabs (a bottom bar on phones), member badge, "Sample data" banner every app shows, and
 * the suggestion chip (tap to add, long press to stop suggesting) with its `useLongPress`, and a copy button.
 *
 * Styled with Tailwind v4 on the kit's palette: import `@huishouden/pwa-kit/tailwind.css` after
 * `tailwindcss` in the app's stylesheet. It maps the theme (forest, cream, terracotta) and adds
 * these files to Tailwind's sources. Icons are lucide-react, like the apps'. Each has `dark:` styles
 * (DESIGN.md "Dark and ambient modes") that apply only under a `.dark` class, for apps with a dark setting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Copy, Ellipsis, EyeOff, Plus, X } from 'lucide-react';
import { personColour, personInitial, personName } from '../people';
import { useKitT } from './i18n';
export const inputClass = 'w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200 dark:bg-forest-900 dark:focus:ring-forest-700';
/** A select styled like the inputs. */
export const selectClass = `${inputClass} appearance-auto`;
export const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-on-primary transition-colors duration-150 hover:bg-primary-hover disabled:opacity-50';
export const ghostButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-muted transition-colors duration-150 hover:bg-stone-100 dark:hover:bg-forest-700';
/** The second action next to a primary button. */
export const secondaryButton = `${ghostButton} border border-line bg-surface disabled:opacity-50`;
export const iconButton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-150 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-forest-700';
/** Footer button that deletes; the destructive action stays quiet until asked for. */
export const deleteButton = 'mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-error hover:bg-stone-100 dark:hover:bg-forest-700';
export const cardClass = 'rounded-2xl border border-line bg-surface shadow-sm';
export const overline = 'text-xs font-semibold uppercase tracking-wide text-muted';
/** A text link with a 44px target: phone numbers, Open in Google Maps, Open in Calendar. */
export const linkClass = '-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium text-link underline-offset-4 transition-colors duration-150 hover:bg-tint hover:underline';
export function Chip({ active, onClick, children, label }) {
    return (_jsx("button", { type: "button", onClick: onClick, "aria-pressed": active, "aria-label": label, className: `inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${active
            ? 'border-forest-700 bg-forest-700 text-white dark:border-forest-300 dark:bg-forest-300 dark:text-forest-900'
            : 'border-line bg-surface text-ink-soft hover:border-forest-400'}`, children: children }));
}
/** How long a finger rests on something before it counts as a long press. */
export const LONG_PRESS_MS = 500;
/**
 * A long press (touch or mouse, held still for `ms`) or a right-click runs `onLongPress`, and the
 * click that ends a long press is swallowed, so the element's own onClick runs only for a tap.
 * Moving more than 10px is a scroll, not a press. Pair the element with a visible way to reach the
 * same action: a long press is not discoverable on its own.
 */
export function useLongPress(onLongPress, ms = LONG_PRESS_MS) {
    const latest = useRef(onLongPress);
    latest.current = onLongPress;
    const timer = useRef(undefined);
    const start = useRef(null);
    const fired = useRef(false);
    const cancel = () => {
        clearTimeout(timer.current);
        start.current = null;
    };
    useEffect(() => () => clearTimeout(timer.current), []);
    return {
        onPointerDown: (e) => {
            fired.current = false;
            if (e.button !== 0)
                return;
            cancel();
            start.current = { x: e.clientX, y: e.clientY };
            timer.current = setTimeout(() => {
                start.current = null;
                fired.current = true;
                latest.current();
            }, ms);
        },
        onPointerMove: (e) => {
            if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10)
                cancel();
        },
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        onContextMenu: (e) => {
            e.preventDefault();
            cancel();
            // A long press on Android also raises contextmenu; the press already ran it.
            if (!fired.current)
                latest.current();
        },
        onClickCapture: (e) => {
            if (!fired.current)
                return;
            fired.current = false;
            e.preventDefault();
            e.stopPropagation();
        },
    };
}
/**
 * Something the app learned and offers back, "tap to add": a pill that runs `onPick` on a tap. A
 * long press or right-click opens a small sheet with "Don't suggest <label>"; with `editing` an ×
 * beside the label does the same at once, for a visible way in (an "Edit" link by the shelf's
 * heading). Every target is at least 44px. Removing is the app's (with its Undo).
 */
export function SuggestionChip({ label, onPick, onRemove, editing, large, removeLabel, hint, }) {
    const kt = useKitT();
    removeLabel ??= kt('ui.dontSuggest', { label });
    const [menu, setMenu] = useState(false);
    const press = useLongPress(() => setMenu(true));
    return (_jsxs("span", { className: `inline-flex min-h-11 shrink-0 items-center rounded-full border border-forest-200 bg-forest-50 font-medium text-forest-700 dark:border-forest-600 dark:bg-forest-800 dark:text-forest-100 ${large ? 'text-lg' : 'text-sm'}`, children: [_jsxs("button", { type: "button", ...press, onClick: onPick, "aria-label": kt('ui.addSuggestion', { label }), className: `inline-flex min-h-11 items-center gap-1.5 rounded-full whitespace-nowrap select-none [-webkit-touch-callout:none] hover:bg-forest-100 dark:hover:bg-forest-700 ${large ? 'px-4' : 'px-3.5'} ${editing ? 'pr-1' : ''}`, children: [_jsx(Plus, { size: large ? 18 : 14, strokeWidth: 2.5, "aria-hidden": "true" }), label] }), editing && (_jsx("button", { type: "button", onClick: onRemove, "aria-label": removeLabel, className: "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-forest-700 hover:bg-tint-strong dark:text-forest-100", children: _jsx(X, { size: large ? 18 : 16, "aria-hidden": "true" }) })), menu &&
                // Into the body, so the sheet takes none of the pill's text styles and no scroller clips it.
                createPortal(_jsxs(Dialog, { title: label, onClose: () => setMenu(false), children: [_jsxs("button", { type: "button", onClick: () => {
                                setMenu(false);
                                onRemove();
                            }, className: `${secondaryButton} w-full justify-start`, children: [_jsx(EyeOff, { size: 18, "aria-hidden": "true" }), " ", removeLabel] }), hint && _jsx("p", { className: "mt-3 text-sm text-muted", children: hint })] }), document.body)] }));
}
/**
 * A dialog: bottom sheet on phones, centred on tablets; title and close row; Escape and the scrim
 * close it. `wide` for a dialog with a table or two columns.
 *
 * Focus is placed once, when it opens, and never again: re-renders (a clock tick, a snapshot, a
 * new `onClose` arrow from the parent) leave it where the person put it. With a mouse the first
 * field takes it (or a field already focused with `autoFocus`); on a touch screen the dialog
 * itself does, so the keyboard only opens when a field is tapped.
 */
export function Dialog({ title, onClose, children, footer, wide }) {
    const kt = useKitT();
    const panel = useRef(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && close.current();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        const el = panel.current;
        if (!el)
            return;
        if (touchScreen())
            return el.focus({ preventScroll: true });
        if (el.contains(document.activeElement))
            return;
        el.querySelector('input, select, textarea, button:not([data-dialog-close])')?.focus();
    }, []);
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6", onClick: onClose, children: _jsxs("div", { ref: panel, role: "dialog", "aria-modal": "true", "aria-label": title, tabIndex: -1, className: `safe-bottom outline-none max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "mb-5 flex items-center justify-between gap-4", children: [_jsx("h2", { className: "text-xl font-semibold text-ink", children: title }), _jsx("button", { type: "button", onClick: onClose, className: iconButton, "aria-label": kt('ui.close'), "data-dialog-close": "", children: _jsx(X, { size: 20 }) })] }), children, footer && _jsx("div", { className: "mt-6 flex flex-wrap items-center justify-end gap-2 [&>*]:whitespace-nowrap max-sm:[&>*]:grow", children: footer })] }) }));
}
/** A touch screen, where focusing a text field opens the on-screen keyboard. */
const touchScreen = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export function Field({ label, children, hint }) {
    return (_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1.5 block text-sm font-medium text-ink-soft", children: label }), children, hint && _jsx("span", { className: "mt-1 block text-sm text-muted", children: hint })] }));
}
/**
 * Copies `text` to the clipboard from a tap, and says "Copied" for a moment: a Zelle email, an
 * account number. `what` names it for screen readers and the tooltip ("Copy the Zelle email").
 */
export function CopyButton({ text, what, className = iconButton }) {
    const kt = useKitT();
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied)
            return;
        const id = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(id);
    }, [copied]);
    const label = kt('ui.copy', { what });
    return (_jsxs("button", { type: "button", className: className, "aria-label": copied ? kt('ui.copied') : label, title: label, onClick: () => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => { });
        }, children: [copied ? _jsx(Check, { size: 18, "aria-hidden": "true" }) : _jsx(Copy, { size: 18, "aria-hidden": "true" }), _jsx("span", { className: "sr-only", "aria-live": "polite", children: copied ? kt('ui.copied') : '' })] }));
}
export function Checkbox({ checked, onChange, children }) {
    return (_jsxs("label", { className: "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-base text-ink", children: [_jsx("input", { type: "checkbox", className: "h-5 w-5 shrink-0 accent-primary", checked: checked, onChange: (e) => onChange(e.target.checked) }), _jsx("span", { className: "min-w-0", children: children })] }));
}
/** "Overdue" and "Soon" labels; nothing for the rest, so the eye goes to what needs doing. */
export function StatusPill({ state }) {
    const kt = useKitT();
    if (state === 'overdue')
        return _jsx("span", { className: "inline-flex shrink-0 items-center rounded-full bg-attention-tint px-2.5 py-0.5 text-sm font-semibold text-attention", children: kt('ui.overdue') });
    if (state === 'soon')
        return _jsx("span", { className: "inline-flex shrink-0 items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-semibold text-ink-soft", children: kt('ui.soon') });
    return null;
}
/** A failed action in words, with Try again. */
export function ErrorNotice({ message, onRetry }) {
    const kt = useKitT();
    return (_jsxs("div", { role: "alert", className: "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-error-tint px-3 py-2 text-base text-error", children: [_jsx("span", { className: "min-w-0 flex-1", children: message }), _jsx("button", { type: "button", className: "min-h-11 rounded-xl px-3 font-semibold underline-offset-4 hover:underline", onClick: onRetry, children: kt('ui.tryAgain') })] }));
}
/**
 * The note above a signed-out app's invented household. On phones it is one line, the "Sample data"
 * chip and `short`, which opens `text` on a tap; from 640px up `text` sits beside the chip.
 * `notice` (a sign-in error) takes the text's place at every width. `children` (scenario chips) follow
 * on their own row on phones, on the same row when there is room.
 */
export function SampleBanner({ text, short, notice, children, className = '', }) {
    const kt = useKitT();
    short ??= kt('ui.nothingSaved');
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { role: "note", "data-sample-banner": true, className: `${cardClass} flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1 sm:px-4 sm:py-1.5 ${className}`, children: [_jsxs("div", { "data-sample-line": true, className: "flex min-h-11 w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1 sm:gap-4", children: [_jsx("span", { "data-sample-chip": true, className: "shrink-0 rounded-full bg-attention-tint px-3 py-1 text-sm font-semibold whitespace-nowrap text-attention", children: kt('ui.sampleData') }), notice ? (typeof notice === 'string' ? _jsx("p", { className: "min-w-0 flex-1 text-base text-muted", children: notice }) : _jsx("div", { className: "min-w-0 flex-1", children: notice })) : (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", "data-sample-short": true, "aria-expanded": open, onClick: () => setOpen((o) => !o), className: "flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-xl text-left text-sm text-muted sm:hidden", children: [_jsx("span", { className: "truncate", children: short }), _jsx(ChevronDown, { size: 16, strokeWidth: 2.2, "aria-hidden": true, className: `shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}` }), _jsx("span", { className: "sr-only", children: open ? kt('ui.hideDetails') : kt('ui.details') })] }), _jsx("p", { className: "hidden min-w-0 flex-1 text-base text-muted sm:block", children: text })] }))] }), open && !notice && _jsx("p", { className: "w-full pb-1.5 text-sm text-muted sm:hidden", children: text }), children] }));
}
/** Tabs the phone's bottom bar has room for, More included. */
export const BOTTOM_NAV_MAX = 5;
/**
 * Which tabs the phone's bottom bar shows and which go under More: all of them when they fit
 * (four or fewer), else the ones marked `primary` (the first four if none is), in their order.
 */
export function splitTabs(tabs) {
    if (tabs.length < BOTTOM_NAV_MAX)
        return { bar: tabs, more: [] };
    const marked = tabs.filter((t) => t.primary).slice(0, BOTTOM_NAV_MAX - 1);
    const bar = marked.length ? marked : tabs.slice(0, BOTTOM_NAV_MAX - 1);
    return { bar, more: tabs.filter((t) => !bar.includes(t)) };
}
/**
 * The app's sections. On tablets and desktops (640px and up) a segmented control in the app bar's
 * `nav` slot: `<AppBar …><SectionTabs tabs={…} tab={tab} onTab={setTab} /></AppBar>`. On phones a
 * bar fixed to the bottom of the screen instead (DESIGN.md "Frame"): up to four tabs with icon and
 * short label, and More opening a sheet with the rest when there are five or more. While the bar
 * shows, `<html data-hh-bottom-nav>` gives the page bottom padding (the kit's tailwind.css) and sets
 * `--hh-bottom-nav` to its height, so an app's own fixed bottom elements sit above it with
 * `bottom-(--hh-bottom-nav)`. Dialogs and sheets cover it.
 *
 * `compact` tightened the phone tabs before the bottom bar; it no longer changes anything.
 */
export function SectionTabs({ tabs, tab, onTab }) {
    const kt = useKitT();
    if (tabs.length === 0)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("nav", { slot: "nav", "data-bottom-nav": "", "aria-label": kt('ui.sections'), className: "hidden w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1 sm:flex sm:w-auto", children: tabs.map((t) => (_jsx("button", { type: "button", onClick: () => onTab(t.id), "aria-current": t.id === tab ? 'page' : undefined, className: `min-h-11 flex-1 rounded-xl px-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 sm:flex-none sm:px-5 sm:text-base ${t.id === tab ? 'bg-primary text-on-primary' : 'text-muted hover:bg-stone-100 dark:hover:bg-forest-700'}`, children: t.label }, t.id))) }), typeof document !== 'undefined' && createPortal(_jsx(BottomNav, { tabs: tabs, tab: tab, onTab: onTab }), document.body)] }));
}
const BOTTOM_NAV_ATTR = 'data-hh-bottom-nav';
function BottomNav({ tabs, tab, onTab }) {
    const kt = useKitT();
    const [sheet, setSheet] = useState(false);
    const { bar, more } = splitTabs(tabs);
    const inMore = more.some((t) => t.id === tab);
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute(BOTTOM_NAV_ATTR, '');
        return () => root.removeAttribute(BOTTOM_NAV_ATTR);
    }, []);
    const item = (key, label, Icon, active, props) => (_jsx("li", { className: "flex min-w-0 flex-1", children: _jsxs("button", { type: "button", ...props, className: `flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors duration-150 ${active ? 'text-link' : 'text-muted'}`, children: [_jsx("span", { "aria-hidden": true, className: `flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ${active ? 'bg-forest-100 dark:bg-forest-700' : ''}`, children: Icon ? _jsx(Icon, { size: 22, strokeWidth: active ? 2.4 : 2 }) : null }), _jsx("span", { className: `max-w-full truncate ${active ? 'font-semibold' : ''}`, children: label })] }) }, key));
    return (_jsxs(_Fragment, { children: [_jsx("nav", { [BOTTOM_NAV_ATTR]: '', "aria-label": kt('ui.sections'), className: "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] sm:hidden", children: _jsxs("ul", { className: "mx-auto flex max-w-lg", children: [bar.map((t) => item(t.id, t.short ?? t.label, t.icon, t.id === tab, { onClick: () => onTab(t.id), 'aria-current': t.id === tab ? 'page' : undefined })), more.length > 0 &&
                            item('more', kt('ui.more'), Ellipsis, inMore, {
                                onClick: () => setSheet(true),
                                'aria-haspopup': 'dialog',
                                'aria-expanded': sheet,
                                'aria-label': inMore ? kt('ui.moreShowing', { tab: more.find((t) => t.id === tab).label }) : kt('ui.more'),
                            })] }) }), sheet && (_jsx(Dialog, { title: kt('ui.more'), onClose: () => setSheet(false), children: _jsx("ul", { className: "grid gap-1", children: more.map((t) => {
                        const Icon = t.icon;
                        const active = t.id === tab;
                        return (_jsx("li", { children: _jsxs("button", { type: "button", "aria-current": active ? 'page' : undefined, onClick: () => {
                                    setSheet(false);
                                    onTab(t.id);
                                }, className: `flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium transition-colors duration-150 ${active ? 'bg-tint text-forest-700 dark:text-forest-200' : 'text-ink hover:bg-stone-100 dark:hover:bg-forest-700'}`, children: [Icon ? _jsx(Icon, { size: 22, "aria-hidden": true }) : null, t.label] }) }, t.id));
                    }) }) }))] }));
}
/** A member's initial on their colour, for "logged by" marks. */
export function PersonBadge({ email, me, members, size = 32 }) {
    const kt = useKitT();
    const name = personName(email, { email: me });
    return (_jsx("span", { className: "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-tile-ring", style: { width: size, height: size, backgroundColor: personColour(email, members), fontSize: size * 0.42 }, title: kt('ui.loggedBy', { name }), "aria-label": kt('ui.loggedBy', { name }), role: "img", children: personInitial(email) }));
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
    const kt = useKitT();
    useEffect(() => {
        if (!toast)
            return;
        const id = setTimeout(onDone, toast.tone === 'error' ? 9000 : 6000);
        return () => clearTimeout(id);
    }, [toast, onDone]);
    return (_jsx("div", { "aria-live": "polite", className: "pointer-events-none fixed inset-x-0 bottom-(--hh-bottom-nav) z-[60] flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]", children: toast && (_jsxs("div", { className: `pointer-events-auto flex min-h-14 max-w-xl items-center gap-4 rounded-2xl px-5 py-2 text-base font-medium text-white shadow-lg ${toast.tone === 'error' ? 'bg-red-700 ring-1 ring-toast-ring' : 'bg-toast ring-1 ring-toast-ring'}`, children: [_jsx("span", { children: toast.message }), toast.undo && (_jsx("button", { type: "button", onClick: () => {
                        toast.undo?.();
                        onDone();
                    }, className: "min-h-11 rounded-xl px-3 font-semibold text-forest-200 underline-offset-4 hover:underline", children: kt('ui.undo') }))] })) }));
}
