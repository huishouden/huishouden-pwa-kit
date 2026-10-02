import { addDays, addMonths, daysBetween, daysUntil, MONTHS, ordinal, toYmd, WEEKDAYS, weekday, ymdParts } from './time';
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
