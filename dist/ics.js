import { offsetAt as zoneOffset } from './local-clock.js';
import { addDays, daysInMonth, ymdParts, weekday } from './time.js';
import { ruleOccurrences } from './schedule.js';
/**
 * iCalendar (RFC 5545) text: a whole calendar for a subscribed feed (`./calendar-export`), or one
 * event for an "Add to calendar" download. Server-safe: no package, no DOM, no Firebase.
 *
 * Timed events are written in the calendar's time zone (`DTSTART;TZID=...`) with a VTIMEZONE built
 * from the runtime's own time zone data, so a 9:00 pickup stays at 9:00 across a clock change. All
 * day events are dates. Repeating events carry an RRULE from the kit's `EventRule` (`ruleToRrule`),
 * EXDATEs for skipped days and RECURRENCE-ID overrides for moved ones. Lines are folded at 75
 * octets and end in CRLF.
 */
export const CRLF = '\r\n';
/** Text escaped for a TEXT value: backslash, semicolon, comma and line breaks. */
export function escapeText(s) {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}
const encoder = new TextEncoder();
/** One content line folded at 75 octets (never inside a UTF-8 character), continuation lines starting with a space. */
export function foldLine(line) {
    if (encoder.encode(line).length <= 75)
        return line;
    const parts = [];
    let current = '';
    let size = 0;
    let limit = 75;
    for (const ch of line) {
        const n = encoder.encode(ch).length;
        if (size + n > limit) {
            parts.push(current);
            current = '';
            size = 0;
            // Continuation lines start with a space, which counts toward their 75.
            limit = 74;
        }
        current += ch;
        size += n;
    }
    parts.push(current);
    return parts.join(`${CRLF} `);
}
const pad = (n, w = 2) => String(n).padStart(w, '0');
const offsets = new Map();
/**
 * `./local-clock`'s offset, remembered per zone and quarter hour (zones change offset only on
 * quarter hours): a feed asks for the same few days hundreds of times, and each `Intl` call costs.
 */
function offsetAt(timeZone, t) {
    const key = `${timeZone}|${Math.floor(t / 900_000)}`;
    let off = offsets.get(key);
    if (off === undefined) {
        if (offsets.size > 50_000)
            offsets.clear();
        off = zoneOffset(timeZone, Math.floor(t / 900_000) * 900_000);
        offsets.set(key, off);
    }
    return off;
}
/** "20311105" for a day. */
export const icsDate = (day) => day.replace(/-/g, '');
/** "20311105T143000Z" for an absolute time. */
export function icsUtc(t) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
/** The wall clock in `timeZone` at `t`, as a UTC-field Date (`./local-clock`'s local frame). */
const wall = (timeZone, t) => new Date(t + offsetAt(timeZone, t));
/** "20311105T143000" (local, no zone) for an absolute time on `timeZone`'s wall clock. */
export function icsLocal(t, timeZone) {
    const d = wall(timeZone, t);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
/** The day `t` falls on in `timeZone`. */
export function dayIn(t, timeZone) {
    return wall(timeZone, t).toISOString().slice(0, 10);
}
/** "14:30" on `timeZone`'s wall clock at `t`. */
export function clockIn(t, timeZone) {
    return wall(timeZone, t).toISOString().slice(11, 16);
}
/** The absolute time of a wall-clock day and time in `timeZone` (the earlier one on a repeated hour; a skipped hour moves forward). */
export function zonedTime(day, time, timeZone) {
    const p = ymdParts(day);
    const [h, m] = (time ?? '00:00').split(':').map(Number);
    const local = Date.UTC(p.y, p.m - 1, p.d, h, m);
    const first = local - offsetAt(timeZone, local);
    return local - offsetAt(timeZone, first);
}
/**
 * The day an all-day item's stored midnight stands for. The writer's device wrote its own local
 * midnight; in a zone a few hours apart that is late the evening before or early that morning, so
 * the nearest midnight on `timeZone`'s clock is the day.
 */
export function allDayOf(t, timeZone) {
    const local = t + offsetAt(timeZone, t);
    return new Date(Math.round(local / 86_400_000) * 86_400_000).toISOString().slice(0, 10);
}
const isUtcZone = (tz) => tz === 'UTC' || tz === 'Etc/UTC' || tz === 'GMT' || tz === 'Etc/GMT';
// ---- VTIMEZONE ----
const HOUR = 3_600_000;
/** Every offset change in `timeZone` during `year`, found by stepping a week at a time and narrowing to the minute. */
export function transitionsIn(timeZone, year) {
    const out = [];
    let t = Date.UTC(year, 0, 1) - 14 * HOUR;
    const end = Date.UTC(year + 1, 0, 1) - 14 * HOUR;
    let before = offsetAt(timeZone, t);
    while (t < end) {
        const next = Math.min(t + 7 * 24 * HOUR, end);
        const after = offsetAt(timeZone, next);
        if (after !== before) {
            let lo = t;
            let hi = next;
            while (hi - lo > 60_000) {
                const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
                if (offsetAt(timeZone, mid) === before)
                    lo = mid;
                else
                    hi = mid;
            }
            out.push({ at: hi, from: before, to: after });
            before = after;
        }
        t = next;
    }
    return out;
}
const offsetText = (ms) => {
    const sign = ms < 0 ? '-' : '+';
    const m = Math.abs(ms) / 60_000;
    return `${sign}${pad(Math.floor(m / 60))}${pad(m % 60)}`;
};
/** The onset as the wall clock showed it just before (DTSTART of an observance is in TZOFFSETFROM). */
const onset = (tr) => {
    const d = new Date(tr.at + tr.from);
    return { day: d.toISOString().slice(0, 10), text: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00` };
};
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/** A yearly rule ("the last Sunday of March") that every transition of the same kind in `trs` fits, or null. */
function yearlyRule(trs) {
    const first = onset(trs[0]);
    const p = ymdParts(first.day);
    const wd = weekday(first.day);
    const time = first.text.slice(9);
    const candidates = [];
    const nth = Math.ceil(p.d / 7);
    if (nth <= 4)
        candidates.push({ by: `${nth}${DAY_CODES[wd]}`, fits: (d) => weekday(d) === wd && Math.ceil(ymdParts(d).d / 7) === nth });
    if (p.d + 7 > daysInMonth(p.y, p.m))
        candidates.push({ by: `-1${DAY_CODES[wd]}`, fits: (d) => weekday(d) === wd && ymdParts(d).d + 7 > daysInMonth(ymdParts(d).y, ymdParts(d).m) });
    for (const c of candidates) {
        const ok = trs.every((tr) => {
            const o = onset(tr);
            return ymdParts(o.day).m === p.m && o.text.slice(9) === time && c.fits(o.day) && tr.from === trs[0].from && tr.to === trs[0].to;
        });
        if (ok)
            return `FREQ=YEARLY;BYMONTH=${p.m};BYDAY=${c.by}`;
    }
    return null;
}
/**
 * The VTIMEZONE lines for `timeZone`, correct from `fromYear` on: each kind of change (into and out
 * of daylight saving time) as a yearly rule, starting the year before, when the years up to
 * `fromYear + 4` follow one; otherwise each change from two years before to `toYear` listed. A zone without changes gets one
 * STANDARD observance.
 */
export function vtimezone(timeZone, fromYear, toYear = fromYear + 4) {
    const lines = ['BEGIN:VTIMEZONE', `TZID:${timeZone}`, `X-LIC-LOCATION:${timeZone}`];
    // Observances start the year before, so the first of `fromYear`'s days is already covered.
    const years = [];
    for (let y = fromYear - 1; y <= Math.max(toYear, fromYear + 4); y++)
        years.push(transitionsIn(timeZone, y));
    const all = years.flat();
    const observance = (tr, extra) => {
        const kind = tr.to > tr.from ? 'DAYLIGHT' : 'STANDARD';
        return [`BEGIN:${kind}`, `TZOFFSETFROM:${offsetText(tr.from)}`, `TZOFFSETTO:${offsetText(tr.to)}`, `DTSTART:${onset(tr).text}`, ...extra, `END:${kind}`];
    };
    if (all.length === 0) {
        const off = offsetText(offsetAt(timeZone, Date.UTC(fromYear, 0, 1)));
        lines.push('BEGIN:STANDARD', `TZOFFSETFROM:${off}`, `TZOFFSETTO:${off}`, 'DTSTART:19700101T000000', 'END:STANDARD');
        return [...lines, 'END:VTIMEZONE'];
    }
    // Two changes a year, the same each year: one observance with a yearly rule per kind.
    const regular = years.every((y) => y.length === years[0].length) && years[0].length === 2;
    if (regular) {
        const kinds = [0, 1].map((i) => years.map((y) => y[i]));
        const rules = kinds.map(yearlyRule);
        if (rules.every(Boolean)) {
            kinds.forEach((trs, i) => lines.push(...observance(trs[0], [`RRULE:${rules[i]}`])));
            return [...lines, 'END:VTIMEZONE'];
        }
    }
    // Irregular: every change from the year before to the last year, each its own observance.
    const listed = [...transitionsIn(timeZone, fromYear - 2), ...all];
    for (const tr of listed)
        lines.push(...observance(tr, []));
    return [...lines, 'END:VTIMEZONE'];
}
// ---- Recurrence ----
/**
 * The first day `rule` happens on (its DTSTART): `start` itself when the rule happens then, else
 * the first occurrence after it. Null when it never happens.
 */
export function firstOccurrence(rule) {
    const end = rule.until ?? addDays(rule.start, 366 * 2 * rule.every + 400);
    return ruleOccurrences(rule, rule.start, end)[0] ?? null;
}
/**
 * The RRULE value for an event rule, counted from `firstOccurrence(rule)`: weeks run Sunday to
 * Saturday (WKST=SU) as the kit counts them; a day of the month past the 28th falls on the last day
 * of shorter months, as the kit's schedules do (the 31st is BYMONTHDAY=-1, the 29th and 30th
 * BYMONTHDAY with BYSETPOS=-1); 29 February falls on the 28th in other years (BYMONTHDAY=-1). `until` is a date for all-day series; a timed one passes `untilUtc`, the
 * last occurrence's absolute start, since RFC 5545 wants UNTIL in UTC then.
 */
export function ruleToRrule(rule, { untilUtc } = {}) {
    const parts = [];
    const start = ymdParts(rule.start);
    if (rule.freq === 'week') {
        const days = (rule.days?.length ? rule.days : [weekday(rule.start)]).slice().sort((a, b) => a - b);
        parts.push('FREQ=WEEKLY');
        if (rule.every > 1)
            parts.push(`INTERVAL=${rule.every}`);
        parts.push(`BYDAY=${days.map((d) => DAY_CODES[d]).join(',')}`, 'WKST=SU');
    }
    else if (rule.freq === 'month') {
        parts.push('FREQ=MONTHLY');
        if (rule.every > 1)
            parts.push(`INTERVAL=${rule.every}`);
        if (rule.nth !== undefined && rule.weekday !== undefined)
            parts.push(`BYDAY=${rule.nth}${DAY_CODES[rule.weekday]}`);
        else if (start.d === 31)
            parts.push('BYMONTHDAY=-1');
        else if (start.d > 28)
            parts.push(`BYMONTHDAY=${Array.from({ length: start.d - 27 }, (_, i) => 28 + i).join(',')}`, 'BYSETPOS=-1');
        else
            parts.push(`BYMONTHDAY=${start.d}`);
    }
    else {
        parts.push('FREQ=YEARLY');
        if (rule.every > 1)
            parts.push(`INTERVAL=${rule.every}`);
        if (start.m === 2 && start.d === 29)
            parts.push('BYMONTH=2', 'BYMONTHDAY=-1');
        else
            parts.push(`BYMONTH=${start.m}`, `BYMONTHDAY=${start.d}`);
    }
    if (rule.until)
        parts.push(`UNTIL=${untilUtc !== undefined ? icsUtc(untilUtc) : icsDate(rule.until)}`);
    return parts.join(';');
}
/** The last day `rule` happens on, or null when it goes on for ever. */
export function lastOccurrence(rule) {
    if (!rule.until)
        return null;
    const from = addDays(rule.until, -(rule.freq === 'week' ? 7 * rule.every : rule.freq === 'month' ? 31 * rule.every : 366 * rule.every) - 7);
    const list = ruleOccurrences(rule, from < rule.start ? rule.start : from, rule.until);
    return list[list.length - 1] ?? null;
}
function when(name, w, timeZone) {
    if ('date' in w)
        return `${name};VALUE=DATE:${icsDate(w.date)}`;
    return isUtcZone(timeZone) ? `${name}:${icsUtc(w.at)}` : `${name};TZID=${timeZone}:${icsLocal(w.at, timeZone)}`;
}
function dateList(name, values, timeZone) {
    if (values.length === 0)
        return [];
    const days = values.filter((v) => typeof v === 'string');
    const times = values.filter((v) => typeof v === 'number');
    const out = [];
    if (days.length)
        out.push(`${name};VALUE=DATE:${days.map(icsDate).join(',')}`);
    if (times.length)
        out.push(isUtcZone(timeZone) ? `${name}:${times.map(icsUtc).join(',')}` : `${name};TZID=${timeZone}:${times.map((t) => icsLocal(t, timeZone)).join(',')}`);
    return out;
}
const minutesText = (m) => (m === 0 ? 'PT0M' : `-PT${m}M`);
/** The VEVENT lines of one event (unfolded). */
export function veventLines(e, { timeZone, now }) {
    const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${icsUtc(now)}`];
    if (e.recurrenceId !== undefined)
        lines.push(typeof e.recurrenceId === 'string' ? `RECURRENCE-ID;VALUE=DATE:${icsDate(e.recurrenceId)}` : when('RECURRENCE-ID', { at: e.recurrenceId }, timeZone));
    lines.push(when('DTSTART', e.start, timeZone));
    if (e.end)
        lines.push(when('DTEND', e.end, timeZone));
    if (e.rrule)
        lines.push(`RRULE:${e.rrule}`);
    lines.push(...dateList('EXDATE', e.exdates ?? [], timeZone));
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description)
        lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location)
        lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url)
        lines.push(`URL:${e.url}`);
    if (e.categories?.length)
        lines.push(`CATEGORIES:${e.categories.map(escapeText).join(',')}`);
    if (e.sequence !== undefined)
        lines.push(`SEQUENCE:${Math.max(0, Math.floor(e.sequence))}`);
    if (e.lastModified !== undefined)
        lines.push(`LAST-MODIFIED:${icsUtc(e.lastModified)}`);
    if (e.status)
        lines.push(`STATUS:${e.status}`);
    if (e.transparent)
        lines.push('TRANSP:TRANSPARENT');
    for (const [k, v] of Object.entries(e.x ?? {}))
        if (/^X-[A-Z0-9-]+$/.test(k))
            lines.push(`${k}:${escapeText(v)}`);
    for (const a of e.alarms ?? [])
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(a.description)}`, `TRIGGER:${minutesText(a.minutesBefore)}`, 'END:VALARM');
    lines.push('END:VEVENT');
    return lines;
}
/** The earliest year any event (or override) of the calendar touches, for the VTIMEZONE. */
function firstYear(events, now) {
    let min = new Date(now).getUTCFullYear();
    for (const e of events) {
        const t = 'date' in e.start ? Date.parse(`${e.start.date}T00:00:00Z`) : e.start.at;
        const y = new Date(t).getUTCFullYear();
        if (y < min)
            min = y;
    }
    return min;
}
/** A whole VCALENDAR: header, the time zone, every event; folded, CRLF line ends. */
export function icsCalendar({ name, description, timeZone, events, now, refreshMinutes = 60, prodId = '-//Huishouden//Calendar//EN', method, lang }) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodId}`, 'CALSCALE:GREGORIAN'];
    if (method)
        lines.push(`METHOD:${method}`);
    lines.push(`X-WR-CALNAME:${escapeText(name)}`, `NAME:${escapeText(name)}`);
    if (description)
        lines.push(`X-WR-CALDESC:${escapeText(description)}`, `DESCRIPTION:${escapeText(description)}`);
    if (!isUtcZone(timeZone))
        lines.push(`X-WR-TIMEZONE:${timeZone}`);
    if (lang)
        lines.push(`X-WR-LANGUAGE:${lang}`);
    if (!method)
        lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${refreshMinutes >= 60 && refreshMinutes % 60 === 0 ? `${refreshMinutes / 60}H` : `${refreshMinutes}M`}`, `X-PUBLISHED-TTL:PT${refreshMinutes >= 60 && refreshMinutes % 60 === 0 ? `${refreshMinutes / 60}H` : `${refreshMinutes}M`}`);
    const timed = events.some((e) => !('date' in e.start));
    if (timed && !isUtcZone(timeZone))
        lines.push(...vtimezone(timeZone, firstYear(events, now)));
    for (const e of events)
        lines.push(...veventLines(e, { timeZone, now }));
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join(CRLF) + CRLF;
}
// ---- Checking ----
/**
 * What is wrong with iCalendar text, by RFC 5545's structural rules: CRLF line ends, lines of at
 * most 75 octets, components that open and close in order, VERSION and PRODID on the calendar,
 * UID, DTSTAMP and DTSTART on every event, a VTIMEZONE for every TZID used, VALARMs with ACTION
 * and TRIGGER. Empty when it is fine. Used by the tests and by the feed's own self-check.
 */
export function icsProblems(text) {
    const problems = [];
    if (!text.endsWith(CRLF))
        problems.push('does not end with CRLF');
    if (/[^\r]\n/.test(text) || /\r(?!\n)/.test(text))
        problems.push('has a line break that is not CRLF');
    const raw = text.split(CRLF);
    if (raw[raw.length - 1] === '')
        raw.pop();
    raw.forEach((l, i) => {
        if (encoder.encode(l).length > 75)
            problems.push(`line ${i + 1} is longer than 75 octets`);
    });
    const lines = [];
    for (const l of raw) {
        if (l.startsWith(' ') || l.startsWith('\t')) {
            if (lines.length === 0)
                problems.push('starts with a continuation line');
            else
                lines[lines.length - 1] += l.slice(1);
        }
        else
            lines.push(l);
    }
    const stack = [];
    const tzids = new Set();
    const used = new Set();
    for (const line of lines) {
        const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
        if (!m) {
            problems.push(`not a content line: ${line.slice(0, 40)}`);
            continue;
        }
        const name = m[1].toUpperCase();
        const params = m[2];
        const value = m[3];
        if (name === 'BEGIN') {
            stack.push({ name: value.toUpperCase(), props: new Set() });
            continue;
        }
        if (name === 'END') {
            const top = stack.pop();
            if (!top || top.name !== value.toUpperCase()) {
                problems.push(`END:${value} does not close ${top?.name ?? 'anything'}`);
                continue;
            }
            const need = {
                VCALENDAR: ['VERSION', 'PRODID'],
                VEVENT: ['UID', 'DTSTAMP', 'DTSTART'],
                VTIMEZONE: ['TZID'],
                STANDARD: ['DTSTART', 'TZOFFSETFROM', 'TZOFFSETTO'],
                DAYLIGHT: ['DTSTART', 'TZOFFSETFROM', 'TZOFFSETTO'],
                VALARM: ['ACTION', 'TRIGGER'],
            };
            for (const p of need[top.name] ?? [])
                if (!top.props.has(p))
                    problems.push(`${top.name} has no ${p}`);
            continue;
        }
        const top = stack[stack.length - 1];
        if (!top) {
            problems.push(`${name} outside any component`);
            continue;
        }
        top.props.add(name);
        if (top.name === 'VTIMEZONE' && name === 'TZID')
            tzids.add(value);
        const tz = /;TZID=([^;:]+)/i.exec(params);
        if (tz)
            used.add(tz[1]);
        if (name === 'VERSION' && value !== '2.0')
            problems.push('VERSION is not 2.0');
    }
    if (stack.length)
        problems.push(`${stack.map((s) => s.name).join(', ')} never closed`);
    for (const tz of used)
        if (!tzids.has(tz))
            problems.push(`TZID ${tz} has no VTIMEZONE`);
    return problems;
}
