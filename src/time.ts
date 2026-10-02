/**
 * Calendar days and the words for them. Pure: nothing reads the clock, every function takes `now`
 * (ms) or `today` (a `Ymd`), so tests pin them and a demo can run on a fixed day.
 *
 * Two representations, both local time:
 * - a moment, ms since the epoch (`number`): when something happened;
 * - a calendar day, `'YYYY-MM-DD'` (`Ymd`): when something is due. Day arithmetic on these is exact
 *   (no DST or time-zone drift) and month arithmetic clamps to the month's last day.
 * `addDays`, `addMonths` and `daysBetween` take either and give back the same kind.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 'YYYY-MM-DD', a local calendar day. */
export type Ymd = string;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' to its parts, or null when malformed or not a real day (2031-02-30). */
export function ymdParts(s: string | undefined | null): { y: number; m: number; d: number } | null {
  const match = typeof s === 'string' ? YMD.exec(s) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const isYmd = (s: unknown): s is Ymd => typeof s === 'string' && ymdParts(s) !== null;

export const ymd = (y: number, m: number, d: number): Ymd =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The local day containing a moment. */
export function toYmd(t: number): Ymd {
  const date = new Date(t);
  return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** 'YYYY-MM-DD' to local midnight, or null when malformed or not a real day. */
export function parseYmd(s: string | undefined | null): number | null {
  const p = ymdParts(s);
  return p ? new Date(p.y, p.m - 1, p.d).getTime() : null;
}

/** Local midnight of a calendar day; throws on anything that isn't one. */
export function ymdToTime(s: Ymd): number {
  const t = parseYmd(s);
  if (t === null) throw new Error(`Not a date: ${s}`);
  return t;
}

/** Local midnight at the start of the day containing `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Day number since 1970-01-01, ignoring time zones and DST: exact day arithmetic. */
function dayNumber(s: Ymd): number {
  const p = ymdParts(s);
  if (!p) throw new Error(`Not a date: ${s}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY);
}

function fromDayNumber(n: number): Ymd {
  const d = new Date(n * DAY);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** `days` calendar days later: a `Ymd` stays a `Ymd`; a moment becomes local midnight of that day (DST-safe). */
export function addDays(s: Ymd, days: number): Ymd;
export function addDays(t: number, days: number): number;
export function addDays(at: Ymd | number, days: number): Ymd | number {
  if (typeof at === 'string') return fromDayNumber(dayNumber(at) + days);
  const d = new Date(startOfDay(at));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * The same day `months` later (or earlier), clamped to the month's last day: 31 January plus one
 * month is 28 or 29 February. `day` keeps an intended day of month for later steps (the 31st).
 * A moment gives local midnight of the resulting day.
 */
export function addMonths(s: Ymd, months: number, day?: number): Ymd;
export function addMonths(t: number, months: number, day?: number): number;
export function addMonths(at: Ymd | number, months: number, day?: number): Ymd | number {
  const s = typeof at === 'string' ? at : toYmd(at);
  const p = ymdParts(s);
  if (!p) throw new Error(`Not a date: ${s}`);
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const out = ymd(y, m, Math.min(day ?? p.d, daysInMonth(y, m)));
  return typeof at === 'string' ? out : ymdToTime(out);
}

/** Whole calendar days from `from` to `to`, negative when `to` is earlier. Moments count by the day they fall on. */
export function daysBetween(from: Ymd | number, to: Ymd | number): number {
  const day = (x: Ymd | number) => (typeof x === 'string' ? dayNumber(x) : dayNumber(toYmd(x)));
  return day(to) - day(from);
}

/** Calendar days from now to a day or moment; negative once it has passed. */
export const daysUntil = (due: Ymd | number, now: number): number => daysBetween(now, due);

/** 0 = Sunday. */
export const weekday = (s: Ymd): number => new Date(dayNumber(s) * DAY).getUTCDay();

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "1st", "2nd", "23rd", "31st". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

// ---- Durations: how long, from a number of milliseconds ----

/** "35m", "1h", "2h 10m", "1d 3h". Rounds down to the minute; under a minute is "0m". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / MINUTE));
  const d = Math.floor(totalMin / (24 * 60));
  const h = Math.floor((totalMin % (24 * 60)) / 60);
  const m = totalMin % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** "just now" under a minute, otherwise "2h 10m ago". */
export function formatAgo(at: number, now: number): string {
  const ms = now - at;
  if (ms < MINUTE) return 'just now';
  return `${formatDuration(ms)} ago`;
}

/** Hours with one decimal, for totals: "9.5 h". */
export function formatHours(ms: number): string {
  const h = Math.round((ms / HOUR) * 10) / 10;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h`;
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago": the long form, to the nearest unit. */
export function agoWords(at: number, now: number): string {
  const ms = Math.max(0, now - at);
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${plural(Math.round(ms / MINUTE), 'minute')} ago`;
  if (ms < DAY) return `${plural(Math.round(ms / HOUR), 'hour')} ago`;
  return `${plural(Math.round(ms / DAY), 'day')} ago`;
}

// ---- Spans: a number of calendar days in the unit a person would say ----

export interface SpanOptions {
  /** Say days up to this many (default 13: "13 days", then "2 weeks"). */
  daysUpTo?: number;
  /**
   * Months rounded `down` (default: "3 weeks" never means 20 days, weeks run to 60 days so it
   * never says "1 month") or to the `nearest` month (weeks under 60 days, then at least 2 months).
   */
  months?: 'down' | 'nearest';
}

/**
 * "5 days", "3 weeks", "4 months", "2 years". The sign is ignored: callers say "in" or "ago".
 * Days under two weeks, weeks under two months, months under two years, then whole years.
 */
export function formatSpan(days: number, { daysUpTo = 13, months = 'down' }: SpanOptions = {}): string {
  const n = Math.abs(Math.trunc(days));
  if (n <= daysUpTo) return plural(n, 'day');
  if (n < (months === 'down' ? 61 : 60)) return plural(Math.floor(n / 7), 'week');
  if (n < 730) return plural(months === 'down' ? Math.floor(n / 30.44) : Math.max(2, Math.round(n / 30.44)), 'month');
  return plural(Math.floor(n / 365.25), 'year');
}

/** "today", "tomorrow", "in 12 days", "in 3 weeks". */
export function inDays(days: number, options?: SpanOptions): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${formatSpan(days, options)}`;
}

/** "today", "yesterday", "4 days ago", "2 months ago". */
export function daysAgo(days: number, options?: SpanOptions): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${formatSpan(days, options)} ago`;
}

/** "Today", "Tomorrow", "In 5 days", "Yesterday", "12 days ago", by calendar day. */
export function relativeDay(t: number, now: number): string {
  const d = daysBetween(now, t);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return d > 0 ? `In ${d} days` : `${-d} days ago`;
}

// ---- Due dates ----

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

/** Within this many days something counts as "due soon" unless the caller says otherwise. */
export const SOON_DAYS = 14;

/** Where a due day stands from `today`, and how many days away it is (negative when overdue). */
export function dueState(due: Ymd, today: Ymd, soonDays = SOON_DAYS): { state: DueState; days: number } {
  const days = daysBetween(today, due);
  if (days < 0) return { state: 'overdue', days };
  if (days === 0) return { state: 'today', days };
  return { state: days <= soonDays ? 'soon' : 'later', days };
}

/** "Overdue by 5 days", "Due today", "Due tomorrow", "Due in 4 days", "Due in 3 weeks". */
export function dueText(due: Ymd, today: Ymd, options?: SpanOptions): string {
  const days = daysBetween(today, due);
  if (days < 0) return `Overdue by ${formatSpan(days, options)}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${formatSpan(days, options)}`;
}

/** A title used mid-sentence: "Gutter cleaning" becomes "gutter cleaning"; "HVAC filter" and names that start "McX" stay. */
export function midSentence(title: string): string {
  const t = title.trim();
  if (t.length > 1 && t[1] === t[1].toLowerCase() && t[0] !== t[0].toLowerCase()) return t[0].toLowerCase() + t.slice(1);
  return t;
}

/** The glanceable line: "Overdue: gutter cleaning", "Filter change due in 4 days", "Lawn service due today". */
export function dueHeadline(title: string, due: Ymd, today: Ymd, options?: SpanOptions): string {
  const days = daysBetween(today, due);
  const t = title.trim();
  if (days < 0) return `Overdue: ${midSentence(t)}`;
  if (days === 0) return `${t} due today`;
  if (days === 1) return `${t} due tomorrow`;
  return `${t} due in ${formatSpan(days, options)}`;
}

// ---- Dates as words. English, as every Huishouden screen is ----

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

/** "Nov 4", with the year when it isn't today's year (or `today` isn't given): "Dec 2, 2030". */
export function shortDate(s: Ymd, today?: Ymd): string {
  const p = ymdParts(s)!;
  const base = `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}`;
  return today && ymdParts(today)?.y === p.y ? base : `${base}, ${p.y}`;
}

/** "Tuesday, November 4", with the year when it isn't today's year: "Sunday, February 1, 2032". */
export function longDate(s: Ymd, today?: Ymd): string {
  const p = ymdParts(s)!;
  const base = `${WEEKDAYS[weekday(s)]}, ${MONTHS[p.m - 1]} ${p.d}`;
  return today && ymdParts(today)?.y === p.y ? base : `${base}, ${p.y}`;
}

/** "November 2033". */
export function monthYear(s: Ymd): string {
  const p = ymdParts(s)!;
  return `${MONTHS[p.m - 1]} ${p.y}`;
}

/** A due day as a list shows it: "Today", "Tomorrow", "Yesterday", "Friday" (this week), "May 30", "Jan 4, 2032". */
export function dueWords(due: Ymd, today: Ymd): string {
  const n = daysBetween(today, due);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return WEEKDAY.format(ymdToTime(due));
  return shortDate(due, today);
}

// ---- Moments in the device's locale, and form inputs ----

export const formatTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const formatDayLong = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
export const formatDateLong = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const formatDayShort = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const monthShort = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short' });

/** A calendar day in the device's locale: "22 Apr 2031" or "Apr 22, 2031". */
export const formatYmd = (s: Ymd, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(ymdToTime(s)).toLocaleDateString(undefined, options);

/** Value for <input type="datetime-local">, in local time. */
export function toLocalInput(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** An <input type="datetime-local"> value back to a moment; null when empty or malformed. */
export function fromLocalInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : Math.round(t);
}
