import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Calendar search in React: the one-search-at-a-time hook, "Find in my calendar" inside a dialog,
 * the import dialog that lists events not yet in the app, the linked-event row, the one-line
 * hint before Google's first permission window, and suggestions of new events found when the app
 * opens. Built on `findCalendarEvents` in `../calendar`.
 *
 * `app` is the app's short name ("Baby"): it words the hint and keys whether this browser has
 * already been asked (`<app>-calendar-allowed` in localStorage).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, CalendarSearch, ChevronDown, ChevronUp, ExternalLink, MapPin, Plus, X } from 'lucide-react';
import { cachedCalendarToken, calendarError, dismissedEvents, dismissEvent, findCalendarEvents, newSuggestions, notImported, SUGGESTION_RESCAN_MS, suggestionWhen, } from '../calendar';
import { formatDayShort, formatTime } from '../time';
import { Dialog, ErrorNotice, ghostButton, iconButton, linkClass, primaryButton, secondaryButton } from './ui';
const askedKey = (app) => `${app.toLowerCase()}-calendar-allowed`;
/**
 * Whether calendar search can run: signed in, or a browser test standing in for Google with
 * `window.__mockCalendarEvents` (signed-out sample mode has no account to read).
 */
export function calendarAvailable(user) {
    return !!user || (typeof window !== 'undefined' && '__mockCalendarEvents' in window);
}
/** Google has already asked this browser for calendar access once. */
export const calendarAsked = (app) => localStorage.getItem(askedKey(app)) === '1';
/**
 * One calendar search at a time; a newer search wins. Call `run` straight from a click: the first
 * search opens Google's permission window, which browsers only allow in answer to a tap.
 */
export function useCalendarSearch(auth, app) {
    const [state, setState] = useState({ status: 'idle' });
    const seq = useRef(0);
    const run = useCallback(async (queries, options) => {
        const mine = ++seq.current;
        setState({ status: 'searching' });
        try {
            const matches = await findCalendarEvents(auth, queries, options);
            localStorage.setItem(askedKey(app), '1');
            if (mine === seq.current)
                setState({ status: 'done', matches });
        }
        catch (e) {
            if (mine === seq.current)
                setState({ status: 'error', message: calendarError(e) });
        }
    }, [auth, app]);
    const reset = useCallback(() => {
        seq.current++;
        setState({ status: 'idle' });
    }, []);
    return { state, run, reset };
}
/** "Sun, Oct 19, 9:00 AM · Family", in the device's locale. */
export function matchWhen(m) {
    return `${formatDayShort(m.start)}${m.allDay ? ', all day' : `, ${formatTime(m.start)}`} · ${m.calendarName}`;
}
/** One line before Google's first permission window, or why the search is off. */
export function CalendarHint({ app, available }) {
    if (!available)
        return _jsx("p", { className: "text-base text-stone-600", children: "Sign in to search your calendar." });
    if (!calendarAsked(app))
        return _jsxs("p", { className: "text-base text-stone-600", children: ["Google will ask once to let ", app, " read your calendar. ", app, " never changes it."] });
    return null;
}
/**
 * "Find in my calendar" inside a dialog: searches for `query` (what the person typed as the title)
 * and hands the picked event back. The first search opens Google's permission window, so it runs on the tap.
 */
export function CalendarFind({ auth, app, query, available, onPick }) {
    const search = useCalendarSearch(auth, app);
    const q = query.trim();
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("button", { type: "button", className: `${ghostButton} bg-forest-50 text-forest-700 hover:bg-forest-100 disabled:opacity-50`, disabled: !available || !q || search.state.status === 'searching', onClick: () => void search.run(query), children: [_jsx(CalendarSearch, { size: 18 }), " ", search.state.status === 'searching' ? 'Searching your calendars' : 'Find in my calendar'] }), _jsx(CalendarHint, { app: app, available: available }), search.state.status === 'error' && _jsx(ErrorNotice, { message: search.state.message, onRetry: () => void search.run(query) }), search.state.status === 'done' && search.state.matches.length === 0 && (_jsxs("p", { role: "status", className: "text-base text-stone-600", children: ["No events matching \"", q, "\" in your calendars from last week to a year ahead."] })), search.state.status === 'done' && search.state.matches.length > 0 && (_jsx("ul", { className: "grid gap-1.5", "aria-label": "Calendar matches", children: search.state.matches.map((m) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => {
                            onPick(m);
                            search.reset();
                        }, className: "w-full rounded-xl border border-stone-200 px-3 py-2 text-left hover:border-forest-500 hover:bg-forest-50", children: [_jsx("span", { className: "block font-medium text-stone-800 [overflow-wrap:anywhere]", children: m.title }), _jsx("span", { className: "block text-sm text-stone-600", children: matchWhen(m) }), m.location && (_jsxs("span", { className: "flex items-start gap-1 text-sm text-stone-600 [overflow-wrap:anywhere]", children: [_jsx(MapPin, { size: 14, className: "mt-0.5 shrink-0", "aria-hidden": "true" }), " ", m.location] }))] }) }, `${m.id}-${m.start}`))) }))] }));
}
/** The linked calendar event inside a dialog, with a way to unlink it. */
export function LinkedEvent({ link, onUnlink }) {
    return (_jsxs("div", { className: "flex items-center gap-2 rounded-xl bg-forest-50 py-0.5 pr-1 pl-3 text-base text-stone-700", children: [_jsx("span", { className: "min-w-0 flex-1", children: "From your calendar." }), link && (_jsxs("a", { className: linkClass, href: link, target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 16, "aria-hidden": "true" }), " Open in Calendar"] })), _jsx("button", { type: "button", className: iconButton, "aria-label": "Unlink from the calendar event", onClick: onUnlink, children: _jsx(X, { size: 18 }) })] }));
}
/**
 * Import from calendar: the theme scan's events that are not in the app yet, each with Add, and
 * Add all. `records` are the app's own (appointments, log entries); an added event leaves the
 * list as soon as its record arrives.
 */
export function CalendarImportDialog({ state, records, intro, noneFound, allImported, onRetry, onAdd, onClose, children }) {
    const fresh = state.status === 'done' ? notImported(state.matches, records) : [];
    return (_jsxs(Dialog, { title: "Import from calendar", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: ghostButton, onClick: onClose, children: "Done" }), fresh.length > 1 && (_jsxs("button", { type: "button", className: primaryButton, onClick: () => {
                        onAdd(fresh);
                        onClose();
                    }, children: ["Add all ", fresh.length] }))] }), children: [_jsx("p", { className: "text-base text-stone-600", children: intro }), children, _jsxs("div", { className: "mt-4", children: [(state.status === 'searching' || state.status === 'idle') && (_jsx("p", { role: "status", className: "text-base text-stone-600", children: "Searching your calendars" })), state.status === 'error' && _jsx(ErrorNotice, { message: state.message, onRetry: onRetry }), state.status === 'done' && fresh.length === 0 && (_jsx("p", { role: "status", className: "text-base text-stone-600", children: state.matches.length ? allImported : noneFound })), fresh.length > 0 && (_jsx("ul", { className: "divide-y divide-stone-200 rounded-2xl border border-stone-200", "aria-label": "Calendar events", children: fresh.map((m) => (_jsxs("li", { className: "flex items-center gap-3 px-3 py-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "font-medium text-stone-800 [overflow-wrap:anywhere]", children: m.title }), _jsx("p", { className: "text-sm text-stone-600", children: matchWhen(m) }), m.location && _jsx("p", { className: "text-sm text-stone-600 [overflow-wrap:anywhere]", children: m.location })] }), _jsxs("button", { type: "button", className: secondaryButton, onClick: () => onAdd([m]), "aria-label": `Add ${m.title}`, children: [_jsx(Plus, { size: 18 }), " Add"] })] }, `${m.id}-${m.start}`))) }))] })] }));
}
const GUEST = 'guest';
/**
 * New calendar events that belong in the app, so "add a vet appointment for Biscuit Tuesday at 3"
 * told to an assistant that writes to Google Calendar turns up in Pet without anyone importing it.
 *
 * Looks when the app opens (and when the signed-in member changes), and again when it comes back
 * into view, at most every 30 minutes, for `words` from now to `horizonDays` ahead. Only with a
 * calendar token this device already has (`cachedCalendarToken`): it never opens Google's window,
 * so without one `canScan` is false and there are no suggestions until the member next uses Import
 * from calendar or Find in my calendar. A failed look is silent; the next one tries again.
 *
 * Mount it once in the app's shell, not in a screen that comes and goes, so switching tabs does not
 * look again. Dismissals are kept per member in localStorage (`<app>-calendar-dismissed-<uid>`).
 */
export function useCalendarSuggestions({ auth, words, isImported, app, horizonDays = 60, limit = 25 }) {
    const [member, setMember] = useState(() => auth.currentUser?.uid ?? GUEST);
    const [canScan, setCanScan] = useState(false);
    const [matches, setMatches] = useState([]);
    const [dismissed, setDismissed] = useState(() => dismissedEvents(app, member));
    const lastScan = useRef(0);
    const seq = useRef(0);
    const settings = useRef({ words, horizonDays, limit });
    settings.current = { words, horizonDays, limit };
    const scan = useCallback(async () => {
        const token = cachedCalendarToken(auth);
        setCanScan(!!token);
        const mine = ++seq.current;
        if (!token) {
            setMatches([]);
            return;
        }
        lastScan.current = Date.now();
        const { words, horizonDays, limit } = settings.current;
        const from = Date.now();
        const to = from + horizonDays * 86_400_000;
        try {
            const found = await findCalendarEvents(auth, [...words], { token, from, to, limit });
            // The real search keeps to the window already; the browser-test stand-in does not.
            if (mine === seq.current)
                setMatches(found.filter((m) => (m.end ?? m.start) >= from && m.start <= to));
        }
        catch {
            // A revoked or expired token is forgotten by the search; the next look starts over.
            if (mine === seq.current)
                setCanScan(!!cachedCalendarToken(auth));
        }
    }, [auth]);
    // On open, then again whenever the signed-in member changes (a restored session arrives after mount).
    const looked = useRef(null);
    useEffect(() => {
        const lookFor = (who) => {
            if (looked.current === who)
                return;
            looked.current = who;
            setMember(who);
            setDismissed(dismissedEvents(app, who));
            setMatches([]);
            void scan();
        };
        lookFor(auth.currentUser?.uid ?? GUEST);
        return auth.onAuthStateChanged((user) => lookFor(user?.uid ?? GUEST));
    }, [auth, app, scan]);
    useEffect(() => {
        const onShow = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastScan.current >= SUGGESTION_RESCAN_MS)
                void scan();
        };
        document.addEventListener('visibilitychange', onShow);
        return () => document.removeEventListener('visibilitychange', onShow);
    }, [scan]);
    const dismiss = useCallback((m) => setDismissed(dismissEvent(app, member, m.id)), [app, member]);
    const suggestions = canScan ? newSuggestions(matches, { isImported, dismissed }) : [];
    return { canScan, suggestions, dismiss, scan };
}
/**
 * The calm one-line card for new calendar events: "New in your calendar: Vet — Biscuit · Tue 3:00 PM"
 * with Add and Not this one, and "+2 more" opening the rest as a list. Renders nothing without
 * suggestions. `onAdd` is the app's own import (the same as Import from calendar's Add); the event
 * leaves the card at once and stays gone when its record arrives.
 */
export function CalendarSuggestions({ suggestions, onAdd, onDismiss, now = Date.now() }) {
    const [open, setOpen] = useState(false);
    const [added, setAdded] = useState(() => new Set());
    const shown = suggestions.filter((m) => !added.has(m.id));
    if (shown.length === 0)
        return null;
    const [first, ...rest] = shown;
    const add = (m) => {
        setAdded((s) => new Set(s).add(m.id));
        onAdd(m);
    };
    const actions = (m) => (_jsxs("div", { className: "flex shrink-0 gap-1", children: [_jsx("button", { type: "button", className: ghostButton, onClick: () => onDismiss(m), "aria-label": `Not this one: ${m.title}`, children: "Not this one" }), _jsxs("button", { type: "button", className: secondaryButton, onClick: () => add(m), "aria-label": `Add ${m.title}`, children: [_jsx(Plus, { size: 18 }), " Add"] })] }));
    return (_jsxs("section", { className: "rounded-2xl border border-stone-200 bg-white px-4 py-2 shadow-sm", "aria-label": "New in your calendar", "aria-live": "polite", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1", children: [_jsx(CalendarPlus, { size: 20, className: "shrink-0 text-forest-700", "aria-hidden": "true" }), _jsxs("p", { className: "min-w-0 flex-1 text-base text-stone-700 [overflow-wrap:anywhere]", children: ["New in your calendar: ", _jsx("span", { className: "font-medium text-stone-800", children: first.title }), _jsxs("span", { className: "text-stone-600", children: [" \u00B7 ", suggestionWhen(first, now)] })] }), rest.length > 0 && (_jsxs("button", { type: "button", className: ghostButton, onClick: () => setOpen((o) => !o), "aria-expanded": open, children: [open ? _jsx(ChevronUp, { size: 18 }) : _jsx(ChevronDown, { size: 18 }), " +", rest.length, " more"] })), actions(first)] }), open && rest.length > 0 && (_jsx("ul", { className: "mt-1 divide-y divide-stone-200 border-t border-stone-200", "aria-label": "More new calendar events", children: rest.map((m) => (_jsxs("li", { className: "flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-8", children: [_jsxs("p", { className: "min-w-0 flex-1 text-base [overflow-wrap:anywhere]", children: [_jsx("span", { className: "font-medium text-stone-800", children: m.title }), _jsxs("span", { className: "text-stone-600", children: [" \u00B7 ", suggestionWhen(m, now)] })] }), actions(m)] }, m.id))) }))] }));
}
