import { GoogleAuthProvider, reauthenticateWithPopup, type Auth } from 'firebase/auth';

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
}

declare global {
  interface Window {
    /** Browser tests set this to stand in for Google Calendar, which has no emulator. */
    __mockCalendarEvents?: CalendarMatch[];
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

let cached: { uid: string; token: string; expires: number } | null = null;

/**
 * A short-lived token that can read the signed-in person's calendars. Re-confirms their Google
 * account in a popup with the calendar scopes added; the first time, Google asks to allow access.
 */
export async function calendarAccessToken(auth: Auth): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  if (cached && cached.uid === user.uid && cached.expires > Date.now()) return cached.token;
  const provider = new GoogleAuthProvider();
  for (const scope of CALENDAR_SCOPES) provider.addScope(scope);
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  const result = await reauthenticateWithPopup(user, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Google did not grant calendar access.');
  // Google access tokens last an hour; refresh a little early.
  cached = { uid: user.uid, token, expires: Date.now() + 55 * 60_000 };
  return token;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink: string;
  status?: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

const localDay = (date: string) => (([y, m, d]) => new Date(y, m - 1, d).getTime())(date.split('-').map(Number));

export function toMatch(e: GoogleEvent, calendarName: string): CalendarMatch | null {
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
  };
}

export interface FindEventsOptions {
  /** Window searched, ms since epoch. Default: a week ago to a year ahead. */
  from?: number;
  to?: number;
  /** At most this many results. Default 10. */
  limit?: number;
}

async function api<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) cached = null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`[${res.status}] Calendar: ${body.error?.message ?? res.statusText}`);
  }
  return (await res.json()) as T;
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
  const token = await calendarAccessToken(auth);
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
          .then((r) => (r.items ?? []).map((e) => toMatch(e, c.summaryOverride ?? c.summary)))
          // One unreadable calendar (a removed share, say) should not hide matches in the others.
          .catch(() => []),
      ),
    );
    for (const m of results.flat()) if (m) found.set(`${m.title}|${m.start}`, m);
    // A single free-text query stops at its most specific phrase that matches; a theme scan uses all.
    if (!Array.isArray(queries) && found.size > 0) break;
  }
  return [...found.values()].sort((a, b) => a.start - b.start).slice(0, limit);
}
