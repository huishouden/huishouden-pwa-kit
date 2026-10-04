import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * New things found in one of the member's Google services that belong in the app (calendar events,
 * Google Tasks), offered as suggestions: looked for on open, when the signed-in member changes and
 * when the app comes back into view (at most every `rescanMs`), only with a token this device
 * already has (it never opens Google's window), minus what the app already has and what this member
 * said "Not this one" to. `useCalendarSuggestions` and Google Tasks suggestions are built on it.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { ghostButton, secondaryButton } from './ui';
import { useKitT } from './i18n';
import { SUGGESTION_RESCAN_MS, dismissId, dismissedIds } from '../suggestions';
export { SUGGESTION_RESCAN_MS, dismissId, dismissedIds };
const GUEST = 'guest';
/**
 * Mount it once in the app's shell, not in a screen that comes and goes, so switching screens does
 * not look again. `look`, `idOf`, `isImported` and `order` may change on every render.
 */
export function useSuggestions({ auth, source, cachedToken, look, idOf, isImported, order, rescanMs = SUGGESTION_RESCAN_MS }) {
    const [member, setMember] = useState(() => auth.currentUser?.uid ?? GUEST);
    const [canScan, setCanScan] = useState(false);
    const [found, setFound] = useState([]);
    const [dismissed, setDismissed] = useState(() => dismissedIds(source, member));
    const lastScan = useRef(0);
    const seq = useRef(0);
    const latest = useRef({ cachedToken, look });
    latest.current = { cachedToken, look };
    const scan = useCallback(async () => {
        const token = latest.current.cachedToken();
        setCanScan(!!token);
        const mine = ++seq.current;
        if (!token) {
            setFound([]);
            return;
        }
        lastScan.current = Date.now();
        try {
            const items = await latest.current.look(token);
            if (mine === seq.current)
                setFound(items);
        }
        catch {
            // A revoked or expired token is forgotten where it failed; the next look starts over.
            if (mine === seq.current)
                setCanScan(!!latest.current.cachedToken());
        }
    }, []);
    // On open, then again whenever the signed-in member changes (a restored session arrives after mount).
    const looked = useRef(null);
    useEffect(() => {
        const lookFor = (who) => {
            if (looked.current === who)
                return;
            looked.current = who;
            setMember(who);
            setDismissed(dismissedIds(source, who));
            setFound([]);
            void scan();
        };
        lookFor(auth.currentUser?.uid ?? GUEST);
        return auth.onAuthStateChanged((user) => lookFor(user?.uid ?? GUEST));
    }, [auth, source, scan]);
    useEffect(() => {
        const onShow = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastScan.current >= rescanMs)
                void scan();
        };
        document.addEventListener('visibilitychange', onShow);
        return () => document.removeEventListener('visibilitychange', onShow);
    }, [scan, rescanMs]);
    const dismiss = useCallback((item) => setDismissed(dismissId(source, member, idOf(item))), [source, member, idOf]);
    const skip = new Set(dismissed);
    const seen = new Set();
    const fresh = canScan
        ? found.filter((item) => {
            const id = idOf(item);
            if (seen.has(id) || skip.has(id) || isImported(item))
                return false;
            seen.add(id);
            return true;
        })
        : [];
    return { canScan, suggestions: order ? [...fresh].sort(order) : fresh, dismiss, scan };
}
/** How long an added event stays hidden waiting for its record; a failed save brings it back. */
export const ADDED_HIDE_MS = 10_000;
/**
 * The calm one-line card for new things from a Google service: "<lead>: <title> · <detail>" with
 * Add and Not this one, and "+2 more" opening the rest as a list. Renders nothing without
 * suggestions. `onAdd` is the app's own import; the item leaves the card at once and stays gone
 * when its record arrives (if none arrives within ten seconds, the save failed and it comes back).
 * After either button, focus stays on the card.
 */
export function SuggestionsCard({ suggestions, idOf, titleOf, detailOf, lead, label, moreLabel, icon, onAdd, onDismiss, addAs }) {
    const kt = useKitT();
    const [open, setOpen] = useState(false);
    const [added, setAdded] = useState(() => new Map());
    const card = useRef(null);
    const listId = useId();
    // Forget added ids once their event is gone from the suggestions (imported, or another member's
    // list), or once the wait for the record is over.
    const ids = suggestions.map(idOf).join('\n');
    useEffect(() => {
        if (added.size === 0)
            return;
        const present = new Set(ids.split('\n'));
        const live = [...added].filter(([id, at]) => present.has(id) && Date.now() - at < ADDED_HIDE_MS);
        if (live.length !== added.size) {
            setAdded(new Map(live));
            return;
        }
        const next = Math.min(...live.map(([, at]) => at + ADDED_HIDE_MS)) - Date.now();
        const timer = setTimeout(() => setAdded((a) => new Map([...a].filter(([, at]) => Date.now() - at < ADDED_HIDE_MS))), Math.max(next, 0));
        return () => clearTimeout(timer);
    }, [ids, added]);
    const shown = suggestions.filter((m) => !added.has(idOf(m)));
    if (shown.length === 0)
        return null;
    const [first, ...rest] = shown;
    const keepFocus = () => setTimeout(() => card.current?.focus());
    const add = (m) => {
        setAdded((a) => new Map(a).set(idOf(m), Date.now()));
        onAdd(m);
        keepFocus();
    };
    const dismiss = (m) => {
        onDismiss(m);
        keepFocus();
    };
    // The title keeps at least 15rem and takes the row; when the buttons no longer fit beside it (a
    // phone), they wrap under it to the right instead of squeezing it into a narrow column.
    const title = 'min-w-0 grow basis-60 text-base break-words';
    const actions = (m, as = addAs?.(m)) => (_jsxs("div", { className: "ml-auto flex shrink-0 flex-wrap justify-end gap-1", children: [_jsx("button", { type: "button", className: ghostButton, onClick: () => dismiss(m), "aria-label": kt('suggestions.notThisOneFor', { title: titleOf(m) }), children: kt('suggestions.notThisOne') }), _jsx("button", { type: "button", className: secondaryButton, onClick: () => add(m), "aria-label": as?.ariaLabel ?? kt('suggestions.add', { title: titleOf(m) }), children: as ? as.label : _jsxs(_Fragment, { children: [_jsx(Plus, { size: 18 }), " ", kt('common.add')] }) })] }));
    return (_jsxs("section", { ref: card, tabIndex: -1, className: "rounded-2xl border border-line bg-surface px-4 py-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-forest-200", "aria-label": label, children: [_jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1", children: [icon, _jsxs("p", { role: "status", className: `${title} text-ink-soft`, children: [lead, ": ", _jsx("span", { className: "font-medium text-ink", children: titleOf(first) }), detailOf(first) && _jsxs("span", { className: "text-muted", children: [" \u00B7 ", detailOf(first)] })] }), rest.length > 0 && (_jsxs("button", { type: "button", className: ghostButton, onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-controls": listId, children: [open ? _jsx(ChevronUp, { size: 18 }) : _jsx(ChevronDown, { size: 18 }), " ", kt('suggestions.more', { count: rest.length })] })), actions(first)] }), open && rest.length > 0 && (_jsx("ul", { id: listId, className: "mt-1 divide-y divide-line border-t border-line", "aria-label": moreLabel, children: rest.map((m) => (_jsxs("li", { className: "flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-8", children: [_jsxs("p", { className: title, children: [_jsx("span", { className: "font-medium text-ink", children: titleOf(m) }), detailOf(m) && _jsxs("span", { className: "text-muted", children: [" \u00B7 ", detailOf(m)] })] }), actions(m)] }, idOf(m)))) }))] }));
}
