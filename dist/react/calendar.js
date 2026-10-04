import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Calendar search in React: the one-search-at-a-time hook, "Find in my calendar" inside a dialog,
 * the import dialog that lists events not yet in the app, the linked-event row, the one-line
 * hint before Google's first permission window, and suggestions of new events found when the app
 * opens. Built on `findCalendarEvents` in `../calendar`. And the other way: `AddToCalendar` puts one
 * item into the person's own calendar (`../calendar-export`).
 *
 * `app` is the app's short name ("Baby"): it keys whether this browser has already been asked
 * (`<app>-calendar-allowed` in localStorage) and words the hint. Pass `name` (the app's name in the
 * page's language, "Bebé") where it differs, so the key stays the same in every language.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, CalendarSearch, Download, ExternalLink, MapPin, Plus, X } from 'lucide-react';
import { addToCalendarIcs, googleTemplateUrl } from '../calendar-export';
import { cachedCalendarToken, calendarError, findCalendarEvents, notImported, SUGGESTION_RESCAN_MS, suggestionWhen, } from '../calendar';
import { formatDayShort, formatTime } from '../time';
import { kt } from '../i18n';
import { useKitT } from './i18n';
import { Dialog, ErrorNotice, ghostButton, iconButton, linkClass, primaryButton, secondaryButton } from './ui';
import { SuggestionsCard, useSuggestions } from './suggestions';
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
/** "Sun, Oct 19, 9:00 AM · Family", in the active locale. */
export function matchWhen(m) {
    const day = formatDayShort(m.start);
    return m.allDay ? kt('calendar.matchAllDay', { day, calendar: m.calendarName }) : kt('calendar.matchTimed', { day, time: formatTime(m.start), calendar: m.calendarName });
}
/** One line before Google's first permission window, or why the search is off. `name` words it (default `app`). */
export function CalendarHint({ app, name = app, available }) {
    const kt = useKitT();
    if (!available)
        return _jsx("p", { className: "text-base text-muted", children: kt('calendar.signInToSearch') });
    if (!calendarAsked(app))
        return _jsx("p", { className: "text-base text-muted", children: kt('calendar.askOnce', { app: name }) });
    return null;
}
/**
 * "Find in my calendar" inside a dialog: searches for `query` (what the person typed as the title)
 * and hands the picked event back. The first search opens Google's permission window, so it runs on the tap.
 */
export function CalendarFind({ auth, app, name, query, available, onPick }) {
    const kt = useKitT();
    const search = useCalendarSearch(auth, app);
    const q = query.trim();
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("button", { type: "button", className: `${ghostButton} bg-tint text-link hover:bg-tint-strong disabled:opacity-50`, disabled: !available || !q || search.state.status === 'searching', onClick: () => void search.run(query), children: [_jsx(CalendarSearch, { size: 18 }), " ", search.state.status === 'searching' ? kt('calendar.searching') : kt('calendar.find')] }), _jsx(CalendarHint, { app: app, name: name, available: available }), search.state.status === 'error' && _jsx(ErrorNotice, { message: search.state.message, onRetry: () => void search.run(query) }), search.state.status === 'done' && search.state.matches.length === 0 && (_jsx("p", { role: "status", className: "text-base text-muted", children: kt('calendar.noMatches', { query: q }) })), search.state.status === 'done' && search.state.matches.length > 0 && (_jsx("ul", { className: "grid gap-1.5", "aria-label": kt('calendar.matches'), children: search.state.matches.map((m) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => {
                            onPick(m);
                            search.reset();
                        }, className: "w-full rounded-xl border border-line px-3 py-2 text-left hover:border-forest-500 hover:bg-tint", children: [_jsx("span", { className: "block font-medium text-ink [overflow-wrap:anywhere]", children: m.title }), _jsx("span", { className: "block text-sm text-muted", children: matchWhen(m) }), m.location && (_jsxs("span", { className: "flex items-start gap-1 text-sm text-muted [overflow-wrap:anywhere]", children: [_jsx(MapPin, { size: 14, className: "mt-0.5 shrink-0", "aria-hidden": "true" }), " ", m.location] }))] }) }, `${m.id}-${m.start}`))) }))] }));
}
/** The linked calendar event inside a dialog, with a way to unlink it. */
export function LinkedEvent({ link, onUnlink }) {
    const kt = useKitT();
    return (_jsxs("div", { className: "flex items-center gap-2 rounded-xl bg-tint py-0.5 pr-1 pl-3 text-base text-ink-soft", children: [_jsx("span", { className: "min-w-0 flex-1", children: kt('calendar.fromCalendar') }), link && (_jsxs("a", { className: linkClass, href: link, target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 16, "aria-hidden": "true" }), " ", kt('calendar.openInCalendar')] })), _jsx("button", { type: "button", className: iconButton, "aria-label": kt('calendar.unlink'), onClick: onUnlink, children: _jsx(X, { size: 18 }) })] }));
}
/**
 * Import from calendar: the theme scan's events that are not in the app yet, each with Add, and
 * Add all. `records` are the app's own (appointments, log entries); an added event leaves the
 * list as soon as its record arrives.
 */
export function CalendarImportDialog({ state, records, intro, noneFound, allImported, onRetry, onAdd, onClose, children }) {
    const kt = useKitT();
    const fresh = state.status === 'done' ? notImported(state.matches, records) : [];
    return (_jsxs(Dialog, { title: kt('calendar.importTitle'), onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: ghostButton, onClick: onClose, children: kt('common.done') }), fresh.length > 1 && (_jsx("button", { type: "button", className: primaryButton, onClick: () => {
                        onAdd(fresh);
                        onClose();
                    }, children: kt('calendar.addAll', { count: fresh.length }) }))] }), children: [_jsx("p", { className: "text-base text-muted", children: intro }), children, _jsxs("div", { className: "mt-4", children: [(state.status === 'searching' || state.status === 'idle') && (_jsx("p", { role: "status", className: "text-base text-muted", children: kt('calendar.searching') })), state.status === 'error' && _jsx(ErrorNotice, { message: state.message, onRetry: onRetry }), state.status === 'done' && fresh.length === 0 && (_jsx("p", { role: "status", className: "text-base text-muted", children: state.matches.length ? allImported : noneFound })), fresh.length > 0 && (_jsx("ul", { className: "divide-y divide-line rounded-2xl border border-line", "aria-label": kt('calendar.events'), children: fresh.map((m) => (_jsxs("li", { className: "flex items-center gap-3 px-3 py-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "font-medium text-ink [overflow-wrap:anywhere]", children: m.title }), _jsx("p", { className: "text-sm text-muted", children: matchWhen(m) }), m.location && _jsx("p", { className: "text-sm text-muted [overflow-wrap:anywhere]", children: m.location })] }), _jsxs("button", { type: "button", className: secondaryButton, onClick: () => onAdd([m]), "aria-label": kt('calendar.addTitle', { title: m.title }), children: [_jsx(Plus, { size: 18 }), " ", kt('common.add')] })] }, `${m.id}-${m.start}`))) }))] })] }));
}
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
    const settings = useRef({ words, horizonDays, limit });
    settings.current = { words, horizonDays, limit };
    const look = useCallback(async (token) => {
        const { words, horizonDays, limit } = settings.current;
        const from = Date.now();
        const to = from + horizonDays * 86_400_000;
        const found = await findCalendarEvents(auth, [...words], { token, from, to, limit });
        // The real search keeps to the window already; the browser-test stand-in does not.
        return found.filter((m) => (m.end ?? m.start) >= from && m.start <= to);
    }, [auth]);
    return useSuggestions({
        auth,
        source: `${app}-calendar`,
        cachedToken: () => cachedCalendarToken(auth),
        look,
        idOf: (m) => m.id,
        isImported,
        order: (a, b) => a.start - b.start,
        rescanMs: SUGGESTION_RESCAN_MS,
    });
}
/**
 * The calm one-line card for new calendar events: "New in your calendar: Vet — Biscuit · Tue 3:00 PM"
 * with Add and Not this one, and "+2 more" opening the rest as a list (`SuggestionsCard`). `onAdd`
 * is the app's own import (the same as Import from calendar's Add).
 */
export function CalendarSuggestions({ suggestions, onAdd, onDismiss, now = Date.now() }) {
    const kt = useKitT();
    return (_jsx(SuggestionsCard, { suggestions: suggestions, idOf: (m) => m.id, titleOf: (m) => m.title, detailOf: (m) => suggestionWhen(m, now), lead: kt('calendar.newInCalendar'), label: kt('calendar.newInCalendar'), moreLabel: kt('calendar.moreNew'), icon: _jsx(CalendarPlus, { size: 20, className: "shrink-0 text-link", "aria-hidden": "true" }), onAdd: onAdd, onDismiss: onDismiss }));
}
// ---- Add to calendar: one item into the person's own calendar ----
/** A file name for the .ics: the title's letters and digits, "event" when none. */
const icsName = (title) => `${title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event'}.ics`;
/**
 * "Add to calendar" for one item: a menu with Google Calendar (its add-event page, in a new tab)
 * and a .ics file that Apple Calendar, Outlook and the rest open. Pass the item as the app
 * publishes it to the agenda (`CalendarEntry`); one on a schedule (`series`) goes in as the whole
 * repeating series. `compact` shows only the icon (rows in a list); the label is its name.
 */
export function AddToCalendar({ entry, compact = false, className }) {
    const kt = useKitT();
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const away = (e) => {
            if (box.current && !box.current.contains(e.target))
                setOpen(false);
        };
        const escape = (e) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', away);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);
    const download = () => {
        const blob = new Blob([addToCalendarIcs(entry)], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = icsName(entry.title);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setOpen(false);
    };
    const label = kt('calendarExport.addTo', { title: entry.title });
    const item = 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-base text-ink hover:bg-stone-100 dark:hover:bg-forest-700';
    return (_jsxs("div", { ref: box, className: `relative inline-block ${className ?? ''}`, children: [_jsxs("button", { type: "button", className: compact ? iconButton : secondaryButton, "aria-label": compact ? label : undefined, title: compact ? label : undefined, "aria-haspopup": "menu", "aria-expanded": open, onClick: (e) => {
                    e.stopPropagation();
                    setOpen((o) => !o);
                }, children: [_jsx(CalendarPlus, { size: 18, "aria-hidden": "true" }), !compact && kt('calendarExport.add')] }), open && (_jsxs("div", { role: "menu", "aria-label": label, className: "absolute right-0 z-30 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg", children: [_jsxs("a", { role: "menuitem", className: item, href: googleTemplateUrl(entry), target: "_blank", rel: "noopener noreferrer", onClick: () => setOpen(false), children: [_jsx(ExternalLink, { size: 16, "aria-hidden": "true" }), " ", kt('calendarExport.google')] }), _jsxs("button", { role: "menuitem", type: "button", className: item, onClick: download, children: [_jsx(Download, { size: 16, "aria-hidden": "true" }), " ", kt('calendarExport.ics')] }), entry.series && _jsx("p", { className: "px-3 pt-1 pb-2 text-sm text-muted", children: kt('calendarExport.repeats') })] }))] }));
}
