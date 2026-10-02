import { googleAccessMessage, popupBlocked, popupCancelled } from './feedback';
import { cachedGoogleToken, googleAccessToken, googleFetch } from './google-token';
import { formatDayShort, formatTime, startOfDay, toYmd } from './time';
/**
 * Finds Google Calendar events that match a piece of household data (a task, an appointment), so
 * an app can fill in its date, time and place from the calendar instead of retyping them.
 * Read-only: the app never writes to the calendar.
 */
export const CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];
/** Words that describe the chore rather than the event, so they are dropped from the search. */
const STOPWORDS = new Set([
    'a', 'an', 'the', 'at', 'on', 'in', 'for', 'to', 'of', 'and', 'with', 'my', 'our', 'get', 'got', 'go', 'have', 'make',
    'book', 'schedule', 'scheduled', 'appointment', 'appt', 'call', 'checked', 'check', 'confirm', 'remember', 'do', 'done',
]);
/** Search phrases, most specific first: "Get car seat checked at fire station" → "car seat fire station", "car seat", ... */
export function searchPhrases(text) {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOPWORDS.has(w));
    if (words.length === 0)
        return [];
    const phrases = [words.join(' ')];
    for (let i = 0; i + 1 < words.length; i++)
        phrases.push(`${words[i]} ${words[i + 1]}`);
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    if (longest.length >= 4)
        phrases.push(longest);
    return [...new Set(phrases)].slice(0, 4);
}
/**
 * A token that can read the signed-in person's calendars. The first time, Google asks to allow
 * access in a window (call from a tap); the token is then reused until it ends. It is kept in
 * localStorage until then, so reopening the app within the hour can look for new events
 * (`cachedCalendarToken`) without asking again.
 */
export function calendarAccessToken(auth) {
    return googleAccessToken(auth, CALENDAR_SCOPES, { persist: true, deniedMessage: 'Google did not grant calendar access.' });
}
/**
 * The calendar token this device already has, without asking anyone; null when there is none.
 * Code that runs on its own (when the app opens) uses this and does nothing without one. Browser
 * tests stand in for it with `window.__mockCalendarToken`.
 */
export function cachedCalendarToken(auth) {
    if (typeof window !== 'undefined' && typeof window.__mockCalendarToken === 'string')
        return window.__mockCalendarToken;
    return cachedGoogleToken(auth, CALENDAR_SCOPES);
}
const localDay = (date) => (([y, m, d]) => new Date(y, m - 1, d).getTime())(date.split('-').map(Number));
export function toMatch(e, calendarName, calendarId) {
    if (e.status === 'cancelled' || (!e.start.dateTime && !e.start.date))
        return null;
    const allDay = !e.start.dateTime;
    const start = allDay ? localDay(e.start.date) : Date.parse(e.start.dateTime);
    const end = e.end?.dateTime ? Date.parse(e.end.dateTime) : e.end?.date ? localDay(e.end.date) : undefined;
    return {
        id: e.id,
        title: e.summary ?? '(no title)',
        start,
        end,
        allDay,
        location: e.location ?? '',
        description: e.description ?? '',
        link: e.htmlLink,
        calendarName,
        ...(calendarId ? { calendarId } : {}),
        ...(e.recurringEventId ? { recurringEventId: e.recurringEventId } : {}),
    };
}
function api(token, path, params) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    return googleFetch(token, url, { label: 'Calendar' });
}
/**
 * Events in any of the person's calendars matching one of the queries, soonest first. Each query
 * is tried as given and then as `searchPhrases` of it, stopping at the first that matches
 * anything; pass several queries to scan for a theme ("prenatal", "pediatric", ...).
 */
export async function findCalendarEvents(auth, queries, options = {}) {
    const limit = options.limit ?? 10;
    if (typeof window !== 'undefined' && window.__mockCalendarEvents)
        return window.__mockCalendarEvents.slice(0, limit);
    const list = Array.isArray(queries) ? queries : [queries];
    const phrases = [...new Set(list.flatMap((q) => (Array.isArray(queries) ? [q.trim().toLowerCase()] : searchPhrases(q))))].filter(Boolean);
    if (phrases.length === 0)
        return [];
    const token = options.token ?? (await calendarAccessToken(auth));
    const { items: calendars = [] } = await api(token, 'users/me/calendarList', { minAccessRole: 'reader' });
    const now = Date.now();
    const window_ = {
        timeMin: new Date(options.from ?? now - 7 * 86_400_000).toISOString(),
        timeMax: new Date(options.to ?? now + 365 * 86_400_000).toISOString(),
    };
    const found = new Map();
    for (const q of phrases) {
        const results = await Promise.all(calendars.map((c) => api(token, `calendars/${encodeURIComponent(c.id)}/events`, {
            q,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: String(limit),
            ...window_,
        })
            .then((r) => (r.items ?? []).map((e) => toMatch(e, c.summaryOverride ?? c.summary, c.id)))
            // One unreadable calendar (a removed share, say) should not hide matches in the others.
            .catch(() => [])));
        for (const m of results.flat())
            if (m)
                found.set(`${m.title}|${m.start}`, m);
        // A single free-text query stops at its most specific phrase that matches; a theme scan uses all.
        if (!Array.isArray(queries) && found.size > 0)
            break;
    }
    const matches = [...found.values()].sort((a, b) => a.start - b.start).slice(0, limit);
    if (options.seriesStart)
        await addSeriesStarts(token, matches);
    return matches;
}
/** The start of the series each repeating match belongs to, fetched once per series; a series that can't be read is left out. */
async function addSeriesStarts(token, matches) {
    const starts = new Map();
    for (const m of matches) {
        if (!m.recurringEventId || !m.calendarId)
            continue;
        const key = `${m.calendarId}|${m.recurringEventId}`;
        if (!starts.has(key))
            starts.set(key, api(token, `calendars/${encodeURIComponent(m.calendarId)}/events/${encodeURIComponent(m.recurringEventId)}`, {})
                .then((master) => toMatch(master, '')?.start)
                .catch(() => undefined));
        const start = await starts.get(key);
        if (start !== undefined)
            m.seriesStart = start;
    }
}
// ---- Importing events into an app's own records ----
/**
 * Calendar descriptions often arrive as HTML: line breaks kept, tags dropped, common entities
 * decoded, at most `max` characters (cut with "…") so notes stay within the app's rules.
 */
export function plainText(description, max = Number.POSITIVE_INFINITY) {
    const text = description
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (text.length <= max)
        return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
}
const sameTitle = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Whether a record already stands for this event: the same event id or link, or the same title at the same time (or on the same day). */
export function isImported(m, records) {
    return records.some((r) => (r.calendarEventId && r.calendarEventId === m.id) ||
        (r.calendarLink && r.calendarLink === m.link) ||
        (((r.at !== undefined && r.at === m.start) || (r.date !== undefined && r.date === toYmd(m.start))) && sameTitle(r.title, m.title)));
}
/** Events not yet imported, each once, soonest first. */
export function notImported(matches, records) {
    const seen = new Set();
    return matches
        .filter((m) => {
        if (seen.has(m.id) || isImported(m, records))
            return false;
        seen.add(m.id);
        return true;
    })
        .sort((a, b) => a.start - b.start);
}
/** A readable reason for a failed calendar search; every case offers Try again. */
export function calendarError(e) {
    if (popupCancelled(e))
        return 'Calendar access was not allowed. Try again when you are ready.';
    if (popupBlocked(e))
        return 'The browser blocked the Google window. Allow pop-ups for this site and try again.';
    const access = googleAccessMessage(e, 'Calendar');
    if (access)
        return access;
    return "Couldn't search your calendar. Check the connection and try again.";
}
// ---- Suggestions: new events found when the app opens ----
/** How often an open app looks again when it comes back into view. */
export const SUGGESTION_RESCAN_MS = 30 * 60_000;
/** Dismissed event ids kept per member and app; the oldest go first. */
const DISMISSED_MAX = 200;
const dismissedKey = (app, member) => `${app.toLowerCase()}-calendar-dismissed-${member}`;
/** Event ids this household member said "Not this one" to in this app, on this device. */
export function dismissedEvents(app, member) {
    try {
        const list = JSON.parse(globalThis.localStorage?.getItem(dismissedKey(app, member)) ?? '[]');
        return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
    }
    catch {
        return [];
    }
}
/** Remembers "Not this one" for an event, so it is never suggested to this member again. */
export function dismissEvent(app, member, eventId) {
    const list = [...dismissedEvents(app, member).filter((id) => id !== eventId), eventId].slice(-DISMISSED_MAX);
    try {
        globalThis.localStorage?.setItem(dismissedKey(app, member), JSON.stringify(list));
    }
    catch {
        // Storage full or unavailable: the dismissal still holds for this visit.
    }
    return list;
}
/** Events worth suggesting: not imported, not dismissed, each once, soonest first. */
export function newSuggestions(matches, { isImported, dismissed }) {
    const skip = new Set(dismissed);
    const seen = new Set();
    return matches
        .filter((m) => {
        if (seen.has(m.id) || skip.has(m.id) || isImported(m))
            return false;
        seen.add(m.id);
        return true;
    })
        .sort((a, b) => a.start - b.start);
}
/**
 * When a suggested event is, short enough for one line: "Today 3:00 PM", "Tomorrow 9:30 AM",
 * "Tue 3:00 PM" within the week, then "Tue, Oct 14, 3:00 PM"; all-day events drop the time.
 */
export function suggestionWhen(m, now) {
    const days = Math.round((startOfDay(m.start) - startOfDay(now)) / 86_400_000);
    const thisWeek = days >= 0 && days < 7;
    const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : thisWeek ? new Date(m.start).toLocaleDateString(undefined, { weekday: 'short' }) : formatDayShort(m.start);
    if (m.allDay)
        return thisWeek ? `${day}, all day` : day;
    return thisWeek ? `${day} ${formatTime(m.start)}` : `${day}, ${formatTime(m.start)}`;
}
