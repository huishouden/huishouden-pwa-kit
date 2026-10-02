import { addDays, addMonths, atTime, clockWords, daysBetween, daysInMonth, daysUntil, HOUR, isHhmm, isYmd, MONTHS, ordinal, shortDate, toHhmm, toYmd, WEEKDAYS, weekday, ymd, ymdParts, } from './time';
export const UNITS = ['day', 'week', 'month', 'year'];
/** The most `every` a schedule may have (the household rules check the same). */
export const MAX_EVERY = 99;
/** `n` units after `from`. Months and years clamp to the month's end and keep `day` for later months. */
export function addInterval(from, n, unit, day) {
    switch (unit) {
        case 'day':
            return addDays(from, n);
        case 'week':
            return addDays(from, 7 * n);
        case 'month':
            return addMonths(from, n, day);
        case 'year':
            return addMonths(from, 12 * n, day);
    }
}
/** The k-th occurrence of a fixed schedule, counted from its anchor (k = 0 is the anchor). */
export function occurrence(s, k) {
    return addInterval(s.anchor, k * s.every, s.unit, ymdParts(s.anchor).d);
}
/** The first occurrence of a fixed schedule on or after `day`. */
export function occurrenceOnOrAfter(s, day) {
    const gap = daysBetween(s.anchor, day);
    if (gap <= 0)
        return s.anchor;
    // Start from an estimate a little short of the answer, then step forward.
    const approxDays = { day: 1, week: 7, month: 28, year: 365 }[s.unit] * s.every;
    let k = Math.max(0, Math.floor(gap / approxDays) - 2);
    while (daysBetween(occurrence(s, k), day) > 0)
        k++;
    return occurrence(s, k);
}
/** The first occurrence strictly after `day`. */
export const occurrenceAfter = (s, day) => occurrenceOnOrAfter(s, addDays(day, 1));
/** Every occurrence of a fixed schedule from `from` to `to`, both included. */
export function occurrences(s, from, to) {
    const out = [];
    for (let d = occurrenceOnOrAfter(s, from); daysBetween(d, to) >= 0 && out.length < 1000; d = occurrenceAfter(s, d))
        out.push(d);
    return out;
}
/**
 * The first due date for a new or edited schedule. Fixed: the first occurrence on or after today.
 * After-done: one interval after the last time it was done, or today when it never was.
 */
export function firstDue(s, today, lastDone) {
    if (s.kind === 'fixed')
        return occurrenceOnOrAfter(s, today);
    return lastDone ? addInterval(lastDone, s.every, s.unit) : today;
}
/**
 * The next due date once it is done on `doneOn`. After-done counts from that day. Fixed moves to
 * the occurrence after both the current due date and the day it was done: doing an overdue job
 * once covers the missed dates, and doing it early covers the coming one.
 */
export function nextDueAfterDone(s, due, doneOn) {
    if (s.kind === 'after-done')
        return addInterval(doneOn, s.every, s.unit);
    return occurrenceAfter(s, daysBetween(due, doneOn) > 0 ? doneOn : due);
}
const unitWord = (unit, n) => (n === 1 ? unit : `${n} ${unit}s`);
/** "Every 3 months", "Every week", "Every month on the 1st", "Every year on November 2", "Every 2 weeks on Tuesday". */
export function describeSchedule(s) {
    const base = `Every ${unitWord(s.unit, s.every)}`;
    if (s.kind === 'after-done')
        return base;
    const p = ymdParts(s.anchor);
    switch (s.unit) {
        case 'day':
            return base;
        case 'week':
            return `${base} on ${WEEKDAYS[weekday(s.anchor)]}`;
        case 'month':
            return `${base} on the ${ordinal(p.d)}`;
        case 'year':
            return `${base} on ${MONTHS[p.m - 1]} ${p.d}`;
    }
}
/** Whether a stored value is a schedule the apps (and the rules) accept. */
export function isSchedule(v) {
    if (!v || typeof v !== 'object')
        return false;
    const s = v;
    if (!Number.isInteger(s.every) || s.every < 1 || s.every > MAX_EVERY)
        return false;
    if (!UNITS.includes(s.unit))
        return false;
    if (s.kind === 'after-done')
        return true;
    return s.kind === 'fixed' && ymdParts(s.anchor) !== null;
}
/** The most recent reading: latest date, and on the same day the higher reading. */
export function latestReading(points) {
    let best = null;
    for (const p of points) {
        if (ymdParts(p.date) === null)
            continue;
        if (!best || p.date > best.date || (p.date === best.date && p.reading > best.reading))
            best = p;
    }
    return best;
}
/**
 * Meter units per day, from the oldest reading within `windowDays` of the latest to the latest.
 * Null without two readings `minDays` apart, or when the meter went nowhere.
 */
export function dailyPace(points, { windowDays = 365, minDays = 14 } = {}) {
    const latest = latestReading(points);
    if (!latest)
        return null;
    let first = null;
    for (const p of points) {
        if (ymdParts(p.date) === null)
            continue;
        const gap = daysBetween(p.date, latest.date);
        if (gap < 0 || gap > windowDays)
            continue;
        if (!first || gap > first.gap || (gap === first.gap && p.reading < first.reading))
            first = { gap, reading: p.reading };
    }
    if (!first)
        return null;
    const distance = latest.reading - first.reading;
    if (first.gap < minDays || distance <= 0)
        return null;
    return distance / first.gap;
}
/**
 * When a usage schedule is next due: by time (every N months from the last time), by the meter
 * (every N units from the reading then), whichever comes first. `pace` (units per day, from
 * `dailyPace`) estimates the days the meter has left.
 */
export function usageDue(s, latest, pace, now, { soonDays = 30, soonShare = 0.1 } = {}) {
    const dueDate = s.everyMonths && s.lastDate ? addMonths(s.lastDate, s.everyMonths) : null;
    const daysLeft = dueDate ? daysUntil(dueDate, now) : null;
    const dueAt = s.everyMeter && s.lastReading !== undefined ? s.lastReading + s.everyMeter : null;
    const meterLeft = dueAt !== null && latest ? dueAt - latest.reading : null;
    // The pace estimate counts from the day of the latest reading, not from today.
    const meterDays = meterLeft !== null && pace && meterLeft > 0 && latest ? Math.max(0, Math.floor(meterLeft / pace) - Math.max(0, -daysUntil(latest.date, now))) : null;
    // Passing the due reading sorts like a day overdue: either way it needs doing now.
    const byMeter = meterLeft === null ? null : meterLeft < 0 ? -1 : meterLeft === 0 ? 0 : meterDays;
    const candidates = [daysLeft, byMeter].filter((d) => d !== null);
    const sortDays = candidates.length ? Math.min(...candidates) : Number.POSITIVE_INFINITY;
    let state;
    if (daysLeft === null && meterLeft === null)
        state = 'unknown';
    else if ((daysLeft !== null && daysLeft < 0) || (meterLeft !== null && meterLeft < 0))
        state = 'overdue';
    else if ((daysLeft !== null && daysLeft <= soonDays) ||
        (meterDays !== null && meterDays <= soonDays) ||
        (meterLeft !== null && !!s.everyMeter && meterLeft <= s.everyMeter * soonShare))
        state = 'soon';
    else
        state = 'ok';
    return { state, dueDate, daysLeft, dueAt, meterLeft, meterDays, sortDays };
}
/** The last-done fields a visit on `date` (at `reading`) writes, or null when the schedule has a later record. */
export function afterUsage(s, date, reading) {
    if (s.lastDate && s.lastDate > date)
        return null;
    return { lastDate: date, ...(reading !== undefined ? { lastReading: reading } : s.lastDate === date ? { lastReading: s.lastReading } : {}) };
}
/** "Every month", "Every 6 months", "Every year", "Every 2 years"; "Once" without an interval. */
export function describeMonths(everyMonths) {
    if (!everyMonths)
        return 'Once';
    if (everyMonths === 12)
        return 'Every year';
    if (everyMonths % 12 === 0)
        return `Every ${everyMonths / 12} years`;
    return everyMonths === 1 ? 'Every month' : `Every ${everyMonths} months`;
}
/** Where a renewal stands: overdue once its day has passed, soon within `soonDays` (default 30). */
export function renewalDue(dueDate, now, soonDays = 30) {
    const days = daysUntil(dueDate, now);
    return { state: days < 0 ? 'overdue' : days <= soonDays ? 'soon' : 'ok', days };
}
/**
 * The due date after renewing: `everyMonths` on from the old due date (the anniversary stays put),
 * stepping past today if it was renewed very late. Null when it doesn't repeat.
 */
export function nextRenewal(dueDate, everyMonths, now) {
    if (!everyMonths)
        return null;
    const today = toYmd(now);
    // Counted from the original date each step, so a 31st stays the 31st where the month has one.
    let k = 1;
    let next = addMonths(dueDate, everyMonths);
    while (next <= today && k < 1200)
        next = addMonths(dueDate, everyMonths * ++k);
    return next;
}
export const EVENT_FREQS = ['week', 'month', 'year'];
export const NTHS = [1, 2, 3, 4, -1];
export const EVENT_RULE_KEYS = ['freq', 'every', 'start', 'days', 'nth', 'weekday', 'until'];
const isWeekday = (n) => Number.isInteger(n) && n >= 0 && n <= 6;
/** Whether a stored value is an event rule the apps (and the rules) accept. */
export function isEventRule(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return false;
    const r = v;
    if (Object.keys(r).some((k) => !EVENT_RULE_KEYS.includes(k)))
        return false;
    if (!EVENT_FREQS.includes(r.freq))
        return false;
    if (!Number.isInteger(r.every) || r.every < 1 || r.every > MAX_EVERY)
        return false;
    if (!isYmd(r.start))
        return false;
    if (r.until !== undefined && (!isYmd(r.until) || r.until < r.start))
        return false;
    if (r.days !== undefined && (r.freq !== 'week' || !Array.isArray(r.days) || r.days.length < 1 || r.days.length > 7 || !r.days.every(isWeekday)))
        return false;
    if ((r.nth === undefined) !== (r.weekday === undefined))
        return false;
    if (r.nth !== undefined && (r.freq !== 'month' || !NTHS.includes(r.nth) || !isWeekday(r.weekday)))
        return false;
    return true;
}
/** The rule as stored: known keys only, days sorted and unique, defaults left out. */
export function cleanRule(rule) {
    const days = rule.freq === 'week' && rule.days ? [...new Set(rule.days)].filter(isWeekday).sort((a, b) => a - b) : undefined;
    return {
        freq: rule.freq,
        every: rule.every,
        start: rule.start,
        ...(days && days.length && !(days.length === 1 && days[0] === weekday(rule.start)) ? { days } : {}),
        ...(rule.freq === 'month' && rule.nth !== undefined && rule.weekday !== undefined ? { nth: rule.nth, weekday: rule.weekday } : {}),
        ...(rule.until ? { until: rule.until } : {}),
    };
}
/** The nth `weekday` (0 = Sunday) of a month (`m` 1 to 12), or with -1 the last. */
export function nthWeekday(y, m, nth, wd) {
    if (nth === -1) {
        const last = daysInMonth(y, m);
        const back = (weekday(ymd(y, m, last)) - wd + 7) % 7;
        return ymd(y, m, last - back);
    }
    const first = (wd - weekday(ymd(y, m, 1)) + 7) % 7;
    return ymd(y, m, 1 + first + 7 * (nth - 1));
}
/** Which weekday of its month a day is: the 3rd Tuesday, and whether it is also the last one. */
export function weekdayOfMonth(day) {
    const p = ymdParts(day);
    return { nth: Math.ceil(p.d / 7), weekday: weekday(day), last: p.d + 7 > daysInMonth(p.y, p.m) };
}
const monthIndex = (day) => {
    const p = ymdParts(day);
    return p.y * 12 + (p.m - 1);
};
/** The rule's day in the month at `index` (year * 12 + month - 1). */
function dayInMonth(rule, index) {
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    if (rule.freq === 'month' && rule.nth !== undefined && rule.weekday !== undefined)
        return nthWeekday(y, m, rule.nth, rule.weekday);
    return ymd(y, m, Math.min(ymdParts(rule.start).d, daysInMonth(y, m)));
}
/** Every day the rule happens from `from` to `to`, both included, soonest first (at most 1000). */
export function ruleOccurrences(rule, from, to) {
    const first = from > rule.start ? from : rule.start;
    const last = rule.until && rule.until < to ? rule.until : to;
    const out = [];
    if (first > last)
        return out;
    if (rule.freq === 'week') {
        const days = rule.days?.length ? rule.days : [weekday(rule.start)];
        const weekOne = addDays(rule.start, -weekday(rule.start));
        // Jump to the first week that counts, then walk its days.
        let week = Math.floor(daysBetween(weekOne, first) / 7);
        week += (rule.every - (week % rule.every)) % rule.every;
        for (; out.length < 1000; week += rule.every) {
            const sunday = addDays(weekOne, week * 7);
            if (sunday > last)
                break;
            for (const wd of [...days].sort((a, b) => a - b)) {
                const d = addDays(sunday, wd);
                if (d >= first && d <= last)
                    out.push(d);
            }
        }
        return out;
    }
    const step = rule.freq === 'year' ? 12 * rule.every : rule.every;
    const start = monthIndex(rule.start);
    let k = Math.max(0, Math.floor((monthIndex(first) - start) / step));
    for (; out.length < 1000; k++) {
        const index = start + k * step;
        if (index > monthIndex(last))
            break;
        const d = dayInMonth(rule, index);
        if (d >= first && d <= last)
            out.push(d);
    }
    return out;
}
/** Whether the rule happens on `day`. */
export const happensOn = (rule, day) => isYmd(day) && ruleOccurrences(rule, day, day).length === 1;
const ORDINAL_WORDS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
function dayList(days) {
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    if (sorted.length === 7)
        return 'day';
    if (sorted.join() === '1,2,3,4,5')
        return 'weekday';
    const names = sorted.map((d) => WEEKDAYS[d]);
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
/**
 * "Every Thursday", "Every other Friday", "Every 3 weeks on Monday", "Every Monday and Thursday",
 * "Every month on the 15th", "Every month on the third Tuesday", "Every 2 months on the last
 * Friday", "Every year on November 2".
 */
export function describeRule(rule) {
    const n = rule.every;
    if (rule.freq === 'week') {
        const days = dayList(rule.days?.length ? rule.days : [weekday(rule.start)]);
        if (n === 1)
            return `Every ${days}`;
        if (n === 2)
            return `Every other ${days}`;
        return `Every ${n} weeks on ${days === 'day' ? 'every day' : days === 'weekday' ? 'weekdays' : days}`;
    }
    if (rule.freq === 'month') {
        const on = rule.nth !== undefined && rule.weekday !== undefined ? `the ${ORDINAL_WORDS[rule.nth]} ${WEEKDAYS[rule.weekday]}` : `the ${ordinal(ymdParts(rule.start).d)}`;
        return `${n === 1 ? 'Every month' : n === 2 ? 'Every other month' : `Every ${n} months`} on ${on}`;
    }
    const p = ymdParts(rule.start);
    return `${n === 1 ? 'Every year' : `Every ${n} years`} on ${MONTHS[p.m - 1]} ${p.d}`;
}
/** At most this many changes are kept per event (the rules check the same); the oldest go first. */
export const MAX_CHANGES = 100;
export const NOTE_MAX = 200;
/** A stored change read defensively: null when it says nothing usable. */
export function toChange(v) {
    if (!v || typeof v !== 'object')
        return null;
    const c = v;
    const m = c.moved;
    const moved = m && typeof m === 'object' && isYmd(m.date) ? { date: m.date, ...(isHhmm(m.time) ? { time: m.time } : {}) } : undefined;
    const note = typeof c.note === 'string' && c.note.trim() ? c.note.trim().slice(0, NOTE_MAX) : undefined;
    if (!moved && c.skipped !== true)
        return null;
    return { ...(c.skipped === true ? { skipped: true } : moved ? { moved } : {}), ...(note ? { note } : {}) };
}
/** How far an occurrence may be moved, in days either way, so a window search finds every moved one. */
export const MAX_MOVE_DAYS = 31;
/**
 * The occurrences that happen from `from` to `to` (both included, by the day they happen on), with
 * each one's change applied: a moved one appears on its new day, even when its original day is
 * outside the window, and a skipped one is left out (or kept, marked, with `includeSkipped`).
 * Changes keyed by a day the rule doesn't happen on are ignored. Soonest first, then by time.
 */
export function eventOccurrences(rule, from, to, { time, changes, includeSkipped = false } = {}) {
    const originals = ruleOccurrences(rule, addDays(from, -MAX_MOVE_DAYS), addDays(to, MAX_MOVE_DAYS));
    const out = [];
    for (const original of originals) {
        const change = changes ? toChange(changes[original]) : null;
        const base = { original, moved: false, skipped: false, ...(change?.note ? { note: change.note } : {}) };
        if (change?.skipped) {
            if (includeSkipped && original >= from && original <= to)
                out.push({ ...base, date: original, ...(time ? { time } : {}), skipped: true });
            continue;
        }
        if (change?.moved) {
            const { date, time: movedTime } = change.moved;
            if (date >= from && date <= to)
                out.push({ ...base, date, ...((movedTime ?? time) ? { time: movedTime ?? time } : {}), moved: true });
            continue;
        }
        if (original >= from && original <= to)
            out.push({ ...base, date: original, ...(time ? { time } : {}) });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0));
}
/** The next occurrence that happens on or after `today` (skipped ones passed over), within `withinDays` (default 400). */
export function nextOccurrence(rule, today, options = {}) {
    return eventOccurrences(rule, today, addDays(today, options.withinDays ?? 400), options)[0] ?? null;
}
/** When an occurrence starts: its time on its day, or local midnight when it is all day. */
export const occurrenceStart = (o) => atTime(o.date, o.time);
/** Changes with one more: `change` null clears it. Keeps at most `MAX_CHANGES`, dropping the oldest days first. */
export function withChange(changes, original, change) {
    const next = {};
    for (const [day, c] of Object.entries(changes ?? {})) {
        const clean = isYmd(day) ? toChange(c) : null;
        if (clean && day !== original)
            next[day] = clean;
    }
    const clean = change ? toChange(change) : null;
    // Moving one back to its own day at the usual time is no change at all.
    if (clean && !(clean.moved && clean.moved.date === original && !clean.moved.time && !clean.note))
        next[original] = clean;
    const days = Object.keys(next).sort();
    for (const day of days.slice(0, Math.max(0, days.length - MAX_CHANGES)))
        delete next[day];
    return next;
}
/** Changes for occurrences before `keepFrom` dropped: what is past no longer needs remembering. */
export function pruneChanges(changes, keepFrom) {
    return Object.fromEntries(Object.entries(changes ?? {}).filter(([day, c]) => {
        const clean = toChange(c);
        return !!clean && (day >= keepFrom || (!!clean.moved && clean.moved.date >= keepFrom));
    }));
}
export const MAX_PREP_DAYS = 14;
export const isPrepOffset = (v) => {
    if (!v || typeof v !== 'object')
        return false;
    const o = v;
    return Object.keys(o).every((k) => k === 'daysBefore' || k === 'time') && Number.isInteger(o.daysBefore) && o.daysBefore >= 0 && o.daysBefore <= MAX_PREP_DAYS && isHhmm(o.time);
};
/** The usual ones, for a picker: the evening before, the morning of. */
export const PREP_PRESETS = [
    { label: 'The evening before', offset: { daysBefore: 1, time: '19:00' } },
    { label: 'The morning of', offset: { daysBefore: 0, time: '07:00' } },
    { label: 'The day before', offset: { daysBefore: 1, time: '09:00' } },
];
/** "The evening before at 7 PM", "The morning of, by 7 AM", "2 days before at 9 AM", "The day before at 12 PM". */
export function describePrep(offset) {
    const at = clockWords(offset.time);
    const hour = Number(offset.time.slice(0, 2));
    if (offset.daysBefore === 0)
        return hour < 12 ? `The morning of, by ${at}` : `The same day, by ${at}`;
    if (offset.daysBefore === 1)
        return hour >= 17 ? `The evening before at ${at}` : `The day before at ${at}`;
    return `${offset.daysBefore} days before at ${at}`;
}
/**
 * The thing to do before an occurrence: due at `deadline`, and missed at `missedAt`, when the
 * event begins (or, for an all-day event or one before the deadline, at the end of its day).
 */
export function prepWindow(o, offset) {
    const day = addDays(o.date, -offset.daysBefore);
    const deadline = atTime(day, offset.time);
    const begins = occurrenceStart(o);
    return { day, deadline, missedAt: o.time && begins > deadline ? begins : atTime(addDays(o.date, 1)) };
}
export function prepState(window, now, done, leadHours = 24) {
    if (done)
        return 'done';
    if (now >= window.missedAt)
        return 'missed';
    if (now >= window.deadline)
        return 'due';
    return window.deadline - now <= leadHours * HOUR ? 'soon' : 'later';
}
/** "tonight by 7 PM", "today by 7 AM", "tomorrow by 7 PM", "Wednesday by 7 PM", "Oct 22 by 7 PM". */
export function prepWhen(deadline, now) {
    const day = toYmd(deadline);
    const today = toYmd(now);
    const by = `by ${clockWords(toHhmm(deadline))}`;
    const n = daysBetween(today, day);
    if (n === 0)
        return `${new Date(deadline).getHours() >= 17 ? 'tonight' : 'today'} ${by}`;
    if (n === 1)
        return `tomorrow ${by}`;
    if (n > 1 && n < 7)
        return `${WEEKDAYS[weekday(day)]} ${by}`;
    return `${shortDate(day, today)} ${by}`;
}
// ---- Recognising a schedule from dates (calendar imports) ----
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
/**
 * The rule a handful of dates follow, or null when they follow none: the occurrences of a repeating
 * calendar event, say. Weekly (the same weekday, every N weeks: the largest step every gap is a
 * multiple of, so a skipped holiday week doesn't break it), monthly on the same day or the same
 * nth weekday, or yearly. Needs at least two different dates; starts on the first.
 */
export function inferRule(dates) {
    const days = [...new Set(dates.filter(isYmd))].sort();
    if (days.length < 2)
        return null;
    const start = days[0];
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
    const weeks = gaps.every((g) => g % 7 === 0) ? gaps.map((g) => g / 7).reduce(gcd) : 0;
    // Every week to every 3 weeks reads as weekly; four-week gaps may be "the second Tuesday", so a
    // monthly pattern wins over those.
    if (weeks >= 1 && weeks <= 3)
        return { freq: 'week', every: weeks, start };
    const monthly = monthlyRule(days);
    if (monthly)
        return monthly;
    return weeks >= 1 && weeks <= 8 ? { freq: 'week', every: weeks, start } : null;
}
function monthlyRule(days) {
    const start = days[0];
    const months = days.slice(1).map((d, i) => monthIndex(d) - monthIndex(days[i]));
    if (!months.every((m) => m > 0))
        return null;
    const step = months.reduce(gcd);
    if (step > MAX_EVERY)
        return null;
    const p = ymdParts(start);
    if (step % 12 === 0 && days.every((d) => d.slice(5) === start.slice(5)))
        return { freq: 'year', every: step / 12, start };
    const sameDay = (d) => {
        const x = ymdParts(d);
        return x.d === Math.min(p.d, daysInMonth(x.y, x.m));
    };
    if (days.every(sameDay))
        return { freq: 'month', every: step, start };
    const w = weekdayOfMonth(start);
    if (w.nth <= 4 && days.every((d) => weekdayOfMonth(d).weekday === w.weekday && weekdayOfMonth(d).nth === w.nth))
        return { freq: 'month', every: step, start, nth: w.nth, weekday: w.weekday };
    if (w.last && days.every((d) => weekdayOfMonth(d).weekday === w.weekday && weekdayOfMonth(d).last))
        return { freq: 'month', every: step, start, nth: -1, weekday: w.weekday };
    return null;
}
export const PREP_TITLE_MAX = 120;
export const isEventPrep = (v) => {
    if (!v || typeof v !== 'object')
        return false;
    const p = v;
    return (Object.keys(p).every((k) => k === 'title' || k === 'offset' || k === 'remind') &&
        typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= PREP_TITLE_MAX &&
        isPrepOffset(p.offset) && typeof p.remind === 'boolean');
};
