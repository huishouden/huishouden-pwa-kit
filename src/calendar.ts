import type { Auth } from 'firebase/auth';
import { googleAccessMessage, popupBlocked, popupCancelled } from './feedback';
import { cachedGoogleToken, googleAccessToken, googleFetch } from './google-token';
import { formatDayShort, formatTime, startOfDay, toYmd } from './time';
import { dismissId, dismissedIds } from './suggestions';

/**
 * Finds Google Calendar events that match a piece of household data (a task, an appointment), so
 * an app can fill in its date, time and place from the calendar instead of retyping them.
 * Read-only: the app never writes to the calendar.
 */

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export interface CalendarMatch {
  id: string;
  title: string;
  /** ms since epoch; for all-day events, local midnight of the day. */
  start: number;
  /** ms since epoch, when the event has an end. */
  end?: number;
  allDay: boolean;
  location: string;
  description: string;
  link: string;
  calendarName: string;
  /** The calendar it is in, for fetching its series. */
  calendarId?: string;
  /** Set on one occurrence of a repeating event: the id of the series. */
  recurringEventId?: string;
  /**
   * When the series began (ms; local midnight for all-day), with `findCalendarEvents(..., { seriesStart: true })`.
   * A yearly birthday entered on the day itself begins on the birth date.
   */
  seriesStart?: number;
}

declare global {
  interface Window {
    /** Browser tests set this to stand in for Google Calendar, which has no emulator. */
    __mockCalendarEvents?: CalendarMatch[];
    /** Browser tests set this to stand in for a calendar token already granted on this device. */
    __mockCalendarToken?: string;
  }
}

/** Words that describe the chore rather than the event, so they are dropped from the search. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'at', 'on', 'in', 'for', 'to', 'of', 'and', 'with', 'my', 'our', 'get', 'got', 'go', 'have', 'make',
  'book', 'schedule', 'scheduled', 'appointment', 'appt', 'call', 'checked', 'check', 'confirm', 'remember', 'do', 'done',
]);

/** Search phrases, most specific first: "Get car seat checked at fire station" → "car seat fire station", "car seat", ... */
export function searchPhrases(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  if (words.length === 0) return [];
  const phrases = [words.join(' ')];
  for (let i = 0; i + 1 < words.length; i++) phrases.push(`${words[i]} ${words[i + 1]}`);
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  if (longest.length >= 4) phrases.push(longest);
  return [...new Set(phrases)].slice(0, 4);
}

/**
 * A token that can read the signed-in person's calendars. The first time, Google asks to allow
 * access in a window (call from a tap); the token is then reused until it ends. It is kept in
 * localStorage until then, so reopening the app within the hour can look for new events
 * (`cachedCalendarToken`) without asking again.
 */
export function calendarAccessToken(auth: Auth): Promise<string> {
  return googleAccessToken(auth, CALENDAR_SCOPES, { persist: true, deniedMessage: 'Google did not grant calendar access.' });
}

/**
 * The calendar token this device already has, without asking anyone; null when there is none.
 * Code that runs on its own (when the app opens) uses this and does nothing without one. Browser
 * tests stand in for it with `window.__mockCalendarToken`.
 */
export function cachedCalendarToken(auth: Auth): string | null {
  if (typeof window !== 'undefined' && typeof window.__mockCalendarToken === 'string') return window.__mockCalendarToken;
  return cachedGoogleToken(auth, CALENDAR_SCOPES);
}

interface GoogleEvent {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink: string;
  status?: string;
  recurringEventId?: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

const localDay = (date: string) => (([y, m, d]) => new Date(y, m - 1, d).getTime())(date.split('-').map(Number));

export function toMatch(e: GoogleEvent, calendarName: string, calendarId?: string): CalendarMatch | null {
  if (e.status === 'cancelled' || (!e.start.dateTime && !e.start.date)) return null;
  const allDay = !e.start.dateTime;
  const start = allDay ? localDay(e.start.date!) : Date.parse(e.start.dateTime!);
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

export interface FindEventsOptions {
  /** Window searched, ms since epoch. Default: a week ago to a year ahead. */
  from?: number;
  to?: number;
  /** At most this many results. Default 10. */
  limit?: number;
  /** Also look up when each repeating match's series began (`seriesStart`): one more request per series. */
  seriesStart?: boolean;
  /** Use this token (from `cachedCalendarToken`) instead of asking for one, so the search never opens a window. */
  token?: string;
}

function api<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return googleFetch<T>(token, url, { label: 'Calendar' });
}

/**
 * Events in any of the person's calendars matching one of the queries, soonest first. Each query
 * is tried as given and then as `searchPhrases` of it, stopping at the first that matches
 * anything; pass several queries to scan for a theme ("prenatal", "pediatric", ...).
 */
export async function findCalendarEvents(auth: Auth, queries: string | string[], options: FindEventsOptions = {}): Promise<CalendarMatch[]> {
  const limit = options.limit ?? 10;
  if (typeof window !== 'undefined' && window.__mockCalendarEvents) return window.__mockCalendarEvents.slice(0, limit);
  const list = Array.isArray(queries) ? queries : [queries];
  const phrases = [...new Set(list.flatMap((q) => (Array.isArray(queries) ? [q.trim().toLowerCase()] : searchPhrases(q))))].filter(Boolean);
  if (phrases.length === 0) return [];
  const token = options.token ?? (await calendarAccessToken(auth));
  const { items: calendars = [] } = await api<{ items?: { id: string; summary: string; summaryOverride?: string }[] }>(
    token,
    'users/me/calendarList',
    { minAccessRole: 'reader' },
  );
  const now = Date.now();
  const window_ = {
    timeMin: new Date(options.from ?? now - 7 * 86_400_000).toISOString(),
    timeMax: new Date(options.to ?? now + 365 * 86_400_000).toISOString(),
  };
  const found = new Map<string, CalendarMatch>();
  for (const q of phrases) {
    const results = await Promise.all(
      calendars.map((c) =>
        api<{ items?: GoogleEvent[] }>(token, `calendars/${encodeURIComponent(c.id)}/events`, {
          q,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: String(limit),
          ...window_,
        })
          .then((r) => (r.items ?? []).map((e) => toMatch(e, c.summaryOverride ?? c.summary, c.id)))
          // One unreadable calendar (a removed share, say) should not hide matches in the others.
          .catch(() => []),
      ),
    );
    for (const m of results.flat()) if (m) found.set(`${m.title}|${m.start}`, m);
    // A single free-text query stops at its most specific phrase that matches; a theme scan uses all.
    if (!Array.isArray(queries) && found.size > 0) break;
  }
  const matches = [...found.values()].sort((a, b) => a.start - b.start).slice(0, limit);
  if (options.seriesStart) await addSeriesStarts(token, matches);
  return matches;
}

/** The start of the series each repeating match belongs to, fetched once per series; a series that can't be read is left out. */
async function addSeriesStarts(token: string, matches: CalendarMatch[]): Promise<void> {
  const starts = new Map<string, Promise<number | undefined>>();
  for (const m of matches) {
    if (!m.recurringEventId || !m.calendarId) continue;
    const key = `${m.calendarId}|${m.recurringEventId}`;
    if (!starts.has(key))
      starts.set(
        key,
        api<GoogleEvent>(token, `calendars/${encodeURIComponent(m.calendarId)}/events/${encodeURIComponent(m.recurringEventId)}`, {})
          .then((master) => toMatch(master, '')?.start)
          .catch(() => undefined),
      );
    const start = await starts.get(key)!;
    if (start !== undefined) m.seriesStart = start;
  }
}

// ---- Importing events into an app's own records ----

/**
 * Calendar descriptions often arrive as HTML: line breaks kept, tags dropped, common entities
 * decoded, at most `max` characters (cut with "…") so notes stay within the app's rules.
 */
export function plainText(description: string, max = Number.POSITIVE_INFINITY): string {
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
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What an app keeps from an imported event: its id and link, and either the moment (`at`, for an
 * appointment) or the day (`date`, for a log entry).
 */
export interface ImportedRecord {
  title: string;
  at?: number;
  date?: string;
  calendarEventId?: string;
  calendarLink?: string;
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether a record already stands for this event: the same event id or link, or the same title at the same time (or on the same day). */
export function isImported(m: CalendarMatch, records: ImportedRecord[]): boolean {
  return records.some(
    (r) =>
      (r.calendarEventId && r.calendarEventId === m.id) ||
      (r.calendarLink && r.calendarLink === m.link) ||
      (((r.at !== undefined && r.at === m.start) || (r.date !== undefined && r.date === toYmd(m.start))) && sameTitle(r.title, m.title)),
  );
}

/** Events not yet imported, each once, soonest first. */
export function notImported(matches: CalendarMatch[], records: ImportedRecord[]): CalendarMatch[] {
  const seen = new Set<string>();
  return matches
    .filter((m) => {
      if (seen.has(m.id) || isImported(m, records)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

/** A readable reason for a failed calendar search; every case offers Try again. */
export function calendarError(e: unknown): string {
  if (popupCancelled(e)) return 'Calendar access was not allowed. Try again when you are ready.';
  if (popupBlocked(e)) return 'The browser blocked the Google window. Allow pop-ups for this site and try again.';
  const access = googleAccessMessage(e, 'Calendar');
  if (access) return access;
  return "Couldn't search your calendar. Check the connection and try again.";
}

// ---- Suggestions: new events found when the app opens ----

export { SUGGESTION_RESCAN_MS } from './suggestions';

/** Event ids this household member said "Not this one" to in this app, on this device. */
export function dismissedEvents(app: string, member: string): string[] {
  return dismissedIds(`${app}-calendar`, member);
}

/** Remembers "Not this one" for an event, so it is never suggested to this member again. */
export function dismissEvent(app: string, member: string, eventId: string): string[] {
  return dismissId(`${app}-calendar`, member, eventId);
}

/** Events worth suggesting: not imported, not dismissed, each once, soonest first. */
export function newSuggestions(matches: CalendarMatch[], { isImported, dismissed }: { isImported: (m: CalendarMatch) => boolean; dismissed: readonly string[] }): CalendarMatch[] {
  const skip = new Set(dismissed);
  const seen = new Set<string>();
  return matches
    .filter((m) => {
      if (seen.has(m.id) || skip.has(m.id) || isImported(m)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * When a suggested event is, short enough for one line: "Today 3:00 PM", "Tomorrow 9:30 AM",
 * "Tue 3:00 PM" within the week, then "Tue, Oct 14, 3:00 PM"; all-day events drop the time.
 */
export function suggestionWhen(m: CalendarMatch, now: number): string {
  const days = Math.round((startOfDay(m.start) - startOfDay(now)) / 86_400_000);
  const thisWeek = days >= 0 && days < 7;
  const day =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : thisWeek ? new Date(m.start).toLocaleDateString(undefined, { weekday: 'short' }) : formatDayShort(m.start);
  if (m.allDay) return thisWeek ? `${day}, all day` : day;
  return thisWeek ? `${day} ${formatTime(m.start)}` : `${day}, ${formatTime(m.start)}`;
}
