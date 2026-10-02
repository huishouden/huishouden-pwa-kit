import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Calendar search in React: the one-search-at-a-time hook, "Find in my calendar" inside a dialog,
 * the import dialog that lists events not yet in the app, the linked-event row and the one-line
 * hint before Google's first permission window. Built on `findCalendarEvents` in `../calendar`.
 *
 * `app` is the app's short name ("Baby"): it words the hint and keys whether this browser has
 * already been asked (`<app>-calendar-allowed` in localStorage).
 */
import { useCallback, useRef, useState } from 'react';
import { CalendarSearch, ExternalLink, MapPin, Plus, X } from 'lucide-react';
import { calendarError, findCalendarEvents, notImported } from '../calendar';
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
