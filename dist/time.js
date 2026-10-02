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
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
export function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** 'YYYY-MM-DD' to its parts, or null when malformed or not a real day (2031-02-30). */
export function ymdParts(s) {
    const match = typeof s === 'string' ? YMD.exec(s) : null;
    if (!match)
        return null;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m))
        return null;
    return { y, m, d };
}
export const isYmd = (s) => typeof s === 'string' && ymdParts(s) !== null;
export const ymd = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** The local day containing a moment. */
export function toYmd(t) {
    const date = new Date(t);
    return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
/** 'YYYY-MM-DD' to local midnight, or null when malformed or not a real day. */
export function parseYmd(s) {
    const p = ymdParts(s);
    return p ? new Date(p.y, p.m - 1, p.d).getTime() : null;
}
/** Local midnight of a calendar day; throws on anything that isn't one. */
export function ymdToTime(s) {
    const t = parseYmd(s);
    if (t === null)
        throw new Error(`Not a date: ${s}`);
    return t;
}
/** Local midnight at the start of the day containing `t`. */
export function startOfDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}
/** Day number since 1970-01-01, ignoring time zones and DST: exact day arithmetic. */
function dayNumber(s) {
    const p = ymdParts(s);
    if (!p)
        throw new Error(`Not a date: ${s}`);
    return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY);
}
function fromDayNumber(n) {
    const d = new Date(n * DAY);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
export function addDays(at, days) {
    if (typeof at === 'string')
        return fromDayNumber(dayNumber(at) + days);
    const d = new Date(startOfDay(at));
    d.setDate(d.getDate() + days);
    return d.getTime();
}
export function addMonths(at, months, day) {
    const s = typeof at === 'string' ? at : toYmd(at);
    const p = ymdParts(s);
    if (!p)
        throw new Error(`Not a date: ${s}`);
    const index = p.y * 12 + (p.m - 1) + months;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    const out = ymd(y, m, Math.min(day ?? p.d, daysInMonth(y, m)));
    return typeof at === 'string' ? out : ymdToTime(out);
}
/** Whole calendar days from `from` to `to`, negative when `to` is earlier. Moments count by the day they fall on. */
export function daysBetween(from, to) {
    const day = (x) => (typeof x === 'string' ? dayNumber(x) : dayNumber(toYmd(x)));
    return day(to) - day(from);
}
/** Calendar days from now to a day or moment; negative once it has passed. */
export const daysUntil = (due, now) => daysBetween(now, due);
/** 0 = Sunday. */
export const weekday = (s) => new Date(dayNumber(s) * DAY).getUTCDay();
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "1st", "2nd", "23rd", "31st". */
export function ordinal(n) {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13)
        return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
// ---- Durations: how long, from a number of milliseconds ----
/** "35m", "1h", "2h 10m", "1d 3h". Rounds down to the minute; under a minute is "0m". */
export function formatDuration(ms) {
    const totalMin = Math.max(0, Math.floor(ms / MINUTE));
    const d = Math.floor(totalMin / (24 * 60));
    const h = Math.floor((totalMin % (24 * 60)) / 60);
    const m = totalMin % 60;
    if (d > 0)
        return h ? `${d}d ${h}h` : `${d}d`;
    if (h > 0)
        return m ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
}
/** "just now" under a minute, otherwise "2h 10m ago". */
export function formatAgo(at, now) {
    const ms = now - at;
    if (ms < MINUTE)
        return 'just now';
    return `${formatDuration(ms)} ago`;
}
/** Hours with one decimal, for totals: "9.5 h". */
export function formatHours(ms) {
    const h = Math.round((ms / HOUR) * 10) / 10;
    return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h`;
}
/** "just now", "5 minutes ago", "2 hours ago", "3 days ago": the long form, to the nearest unit. */
export function agoWords(at, now) {
    const ms = Math.max(0, now - at);
    if (ms < MINUTE)
        return 'just now';
    if (ms < HOUR)
        return `${plural(Math.round(ms / MINUTE), 'minute')} ago`;
    if (ms < DAY)
        return `${plural(Math.round(ms / HOUR), 'hour')} ago`;
    return `${plural(Math.round(ms / DAY), 'day')} ago`;
}
/**
 * "5 days", "3 weeks", "4 months", "2 years". The sign is ignored: callers say "in" or "ago".
 * Days under two weeks, weeks under two months, months under two years, then whole years.
 */
export function formatSpan(days, { daysUpTo = 13, months = 'down' } = {}) {
    const n = Math.abs(Math.trunc(days));
    if (n <= daysUpTo)
        return plural(n, 'day');
    if (n < (months === 'down' ? 61 : 60))
        return plural(Math.floor(n / 7), 'week');
    if (n < 730)
        return plural(months === 'down' ? Math.floor(n / 30.44) : Math.max(2, Math.round(n / 30.44)), 'month');
    return plural(Math.floor(n / 365.25), 'year');
}
/** "today", "tomorrow", "in 12 days", "in 3 weeks". */
export function inDays(days, options) {
    if (days === 0)
        return 'today';
    if (days === 1)
        return 'tomorrow';
    return `in ${formatSpan(days, options)}`;
}
/** "today", "yesterday", "4 days ago", "2 months ago". */
export function daysAgo(days, options) {
    if (days === 0)
        return 'today';
    if (days === 1)
        return 'yesterday';
    return `${formatSpan(days, options)} ago`;
}
/** "Today", "Tomorrow", "In 5 days", "Yesterday", "12 days ago", by calendar day. */
export function relativeDay(t, now) {
    const d = daysBetween(now, t);
    if (d === 0)
        return 'Today';
    if (d === 1)
        return 'Tomorrow';
    if (d === -1)
        return 'Yesterday';
    return d > 0 ? `In ${d} days` : `${-d} days ago`;
}
/** Within this many days something counts as "due soon" unless the caller says otherwise. */
export const SOON_DAYS = 14;
/** Where a due day stands from `today`, and how many days away it is (negative when overdue). */
export function dueState(due, today, soonDays = SOON_DAYS) {
    const days = daysBetween(today, due);
    if (days < 0)
        return { state: 'overdue', days };
    if (days === 0)
        return { state: 'today', days };
    return { state: days <= soonDays ? 'soon' : 'later', days };
}
/** "Overdue by 5 days", "Due today", "Due tomorrow", "Due in 4 days", "Due in 3 weeks". */
export function dueText(due, today, options) {
    const days = daysBetween(today, due);
    if (days < 0)
        return `Overdue by ${formatSpan(days, options)}`;
    if (days === 0)
        return 'Due today';
    if (days === 1)
        return 'Due tomorrow';
    return `Due in ${formatSpan(days, options)}`;
}
/** A title used mid-sentence: "Gutter cleaning" becomes "gutter cleaning"; "HVAC filter" and names that start "McX" stay. */
export function midSentence(title) {
    const t = title.trim();
    if (t.length > 1 && t[1] === t[1].toLowerCase() && t[0] !== t[0].toLowerCase())
        return t[0].toLowerCase() + t.slice(1);
    return t;
}
/** The glanceable line: "Overdue: gutter cleaning", "Filter change due in 4 days", "Lawn service due today". */
export function dueHeadline(title, due, today, options) {
    const days = daysBetween(today, due);
    const t = title.trim();
    if (days < 0)
        return `Overdue: ${midSentence(t)}`;
    if (days === 0)
        return `${t} due today`;
    if (days === 1)
        return `${t} due tomorrow`;
    return `${t} due in ${formatSpan(days, options)}`;
}
// ---- Dates as words. English, as every Huishouden screen is ----
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
/** "Nov 4", with the year when it isn't today's year (or `today` isn't given): "Dec 2, 2030". */
export function shortDate(s, today) {
    const p = ymdParts(s);
    const base = `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}`;
    return today && ymdParts(today)?.y === p.y ? base : `${base}, ${p.y}`;
}
/** "Tuesday, November 4", with the year when it isn't today's year: "Sunday, February 1, 2032". */
export function longDate(s, today) {
    const p = ymdParts(s);
    const base = `${WEEKDAYS[weekday(s)]}, ${MONTHS[p.m - 1]} ${p.d}`;
    return today && ymdParts(today)?.y === p.y ? base : `${base}, ${p.y}`;
}
/** "November 2033". */
export function monthYear(s) {
    const p = ymdParts(s);
    return `${MONTHS[p.m - 1]} ${p.y}`;
}
/** A due day as a list shows it: "Today", "Tomorrow", "Yesterday", "Friday" (this week), "May 30", "Jan 4, 2032". */
export function dueWords(due, today) {
    const n = daysBetween(today, due);
    if (n === 0)
        return 'Today';
    if (n === 1)
        return 'Tomorrow';
    if (n === -1)
        return 'Yesterday';
    if (n > 1 && n < 7)
        return WEEKDAY.format(ymdToTime(due));
    return shortDate(due, today);
}
// ---- Moments in the device's locale, and form inputs ----
export const formatTime = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const formatDayLong = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
export const formatDateLong = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const formatDayShort = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const monthShort = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short' });
/** A calendar day in the device's locale: "22 Apr 2031" or "Apr 22, 2031". */
export const formatYmd = (s, options = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(ymdToTime(s)).toLocaleDateString(undefined, options);
/** Value for <input type="datetime-local">, in local time. */
export function toLocalInput(t) {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** An <input type="datetime-local"> value back to a moment; null when empty or malformed. */
export function fromLocalInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
        return null;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : Math.round(t);
}
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isHhmm = (s) => typeof s === 'string' && HHMM.test(s);
/** Minutes after midnight of an 'HH:MM'; throws on anything else. */
export function hhmmMinutes(s) {
    const m = HHMM.exec(s);
    if (!m)
        throw new Error(`Not a time: ${s}`);
    return Number(m[1]) * 60 + Number(m[2]);
}
/**
 * A day at a time of day, local, as a moment: 19:00 on the day the clocks change is still 19:00 on
 * the wall. Without a time, local midnight. On the one hour a spring-forward day skips, the moment
 * after the gap (02:30 becomes 03:30).
 */
export function atTime(day, time) {
    const p = ymdParts(day);
    if (!p)
        throw new Error(`Not a date: ${day}`);
    if (time === undefined)
        return new Date(p.y, p.m - 1, p.d).getTime();
    const min = hhmmMinutes(time);
    return new Date(p.y, p.m - 1, p.d, Math.floor(min / 60), min % 60).getTime();
}
/** The local 'HH:MM' of a moment. */
export function toHhmm(t) {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** "7 PM", "7:30 AM", "12 PM" (noon), "12 AM" (midnight): how a time is said on a household screen. */
export function clockWords(time) {
    const min = hhmmMinutes(time);
    const h = Math.floor(min / 60);
    const m = min % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
