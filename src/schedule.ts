import {
  addDays, addMonths, atTime, clockWords, daysBetween, daysInMonth, daysUntil, HOUR, isHhmm, isYmd, MONTHS, ordinal, shortDate, toHhmm, toYmd, WEEKDAYS, weekday, ymd,
  ymdParts, type Hhmm, type Ymd,
} from './time';

/**
 * Things that repeat, in three shapes:
 *
 * - **Calendar schedules** (`Schedule`): `after-done` floats ("change the HVAC filter 3 months after
 *   the last change"); `fixed` is anchored to the calendar ("HOA dues on the 1st of every month",
 *   "insurance renews every 1 February").
 * - **Usage schedules** (`usageDue`): every N months or every N on a meter (miles, hours), whichever
 *   comes first, with the meter's recent pace turning distance into days.
 * - **Renewals** (`renewalDue`, `nextRenewal`): a due date that moves on by whole months from the
 *   old due date, so the anniversary stays put.
 * - **Events** (`EventRule`, `eventOccurrences`): things that come and go on a schedule whether or
 *   not anyone does anything (garbage pickup every Thursday, a lawn service every other Friday, the
 *   HOA meeting on the second Tuesday), with one occurrence moved or skipped (`OccurrenceChanges`)
 *   and an optional thing to do before each (`PrepOffset`: put the bins out the evening before).
 *
 * Pure and day-based: callers pass `today` (a `Ymd`) or `now` (ms). Month steps clamp to the
 * month's last day and keep the anchor's day for later months.
 */

export type Unit = 'day' | 'week' | 'month' | 'year';
export const UNITS: readonly Unit[] = ['day', 'week', 'month', 'year'];

export type FixedSchedule = { kind: 'fixed'; every: number; unit: Unit; anchor: Ymd };
export type AfterDoneSchedule = { kind: 'after-done'; every: number; unit: Unit };
export type Schedule = AfterDoneSchedule | FixedSchedule;

/** The most `every` a schedule may have (the household rules check the same). */
export const MAX_EVERY = 99;

/** `n` units after `from`. Months and years clamp to the month's end and keep `day` for later months. */
export function addInterval(from: Ymd, n: number, unit: Unit, day?: number): Ymd {
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
export function occurrence(s: FixedSchedule, k: number): Ymd {
  return addInterval(s.anchor, k * s.every, s.unit, ymdParts(s.anchor)!.d);
}

/** The first occurrence of a fixed schedule on or after `day`. */
export function occurrenceOnOrAfter(s: FixedSchedule, day: Ymd): Ymd {
  const gap = daysBetween(s.anchor, day);
  if (gap <= 0) return s.anchor;
  // Start from an estimate a little short of the answer, then step forward.
  const approxDays = { day: 1, week: 7, month: 28, year: 365 }[s.unit] * s.every;
  let k = Math.max(0, Math.floor(gap / approxDays) - 2);
  while (daysBetween(occurrence(s, k), day) > 0) k++;
  return occurrence(s, k);
}

/** The first occurrence strictly after `day`. */
export const occurrenceAfter = (s: FixedSchedule, day: Ymd): Ymd => occurrenceOnOrAfter(s, addDays(day, 1));

/** Every occurrence of a fixed schedule from `from` to `to`, both included. */
export function occurrences(s: FixedSchedule, from: Ymd, to: Ymd): Ymd[] {
  const out: Ymd[] = [];
  for (let d = occurrenceOnOrAfter(s, from); daysBetween(d, to) >= 0 && out.length < 1000; d = occurrenceAfter(s, d)) out.push(d);
  return out;
}

/**
 * The first due date for a new or edited schedule. Fixed: the first occurrence on or after today.
 * After-done: one interval after the last time it was done, or today when it never was.
 */
export function firstDue(s: Schedule, today: Ymd, lastDone?: Ymd): Ymd {
  if (s.kind === 'fixed') return occurrenceOnOrAfter(s, today);
  return lastDone ? addInterval(lastDone, s.every, s.unit) : today;
}

/**
 * The next due date once it is done on `doneOn`. After-done counts from that day. Fixed moves to
 * the occurrence after both the current due date and the day it was done: doing an overdue job
 * once covers the missed dates, and doing it early covers the coming one.
 */
export function nextDueAfterDone(s: Schedule, due: Ymd, doneOn: Ymd): Ymd {
  if (s.kind === 'after-done') return addInterval(doneOn, s.every, s.unit);
  return occurrenceAfter(s, daysBetween(due, doneOn) > 0 ? doneOn : due);
}

const unitWord = (unit: Unit, n: number) => (n === 1 ? unit : `${n} ${unit}s`);

/** "Every 3 months", "Every week", "Every month on the 1st", "Every year on November 2", "Every 2 weeks on Tuesday". */
export function describeSchedule(s: Schedule): string {
  const base = `Every ${unitWord(s.unit, s.every)}`;
  if (s.kind === 'after-done') return base;
  const p = ymdParts(s.anchor)!;
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
export function isSchedule(v: unknown): v is Schedule {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (!Number.isInteger(s.every) || (s.every as number) < 1 || (s.every as number) > MAX_EVERY) return false;
  if (!UNITS.includes(s.unit as Unit)) return false;
  if (s.kind === 'after-done') return true;
  return s.kind === 'fixed' && ymdParts(s.anchor as string) !== null;
}

// ---- Usage schedules: time or meter, whichever comes first ----

/** A reading of a meter (an odometer, an hour meter) on a day. */
export interface MeterReading {
  date: Ymd;
  reading: number;
}

/** The most recent reading: latest date, and on the same day the higher reading. */
export function latestReading(points: MeterReading[]): MeterReading | null {
  let best: MeterReading | null = null;
  for (const p of points) {
    if (ymdParts(p.date) === null) continue;
    if (!best || p.date > best.date || (p.date === best.date && p.reading > best.reading)) best = p;
  }
  return best;
}

export interface PaceOptions {
  /** How far back the pace looks (default 365 days). */
  windowDays?: number;
  /** Fewer days than this between the first and last point is too little to judge (default 14). */
  minDays?: number;
}

/**
 * Meter units per day, from the oldest reading within `windowDays` of the latest to the latest.
 * Null without two readings `minDays` apart, or when the meter went nowhere.
 */
export function dailyPace(points: MeterReading[], { windowDays = 365, minDays = 14 }: PaceOptions = {}): number | null {
  const latest = latestReading(points);
  if (!latest) return null;
  let first: { gap: number; reading: number } | null = null;
  for (const p of points) {
    if (ymdParts(p.date) === null) continue;
    const gap = daysBetween(p.date, latest.date);
    if (gap < 0 || gap > windowDays) continue;
    if (!first || gap > first.gap || (gap === first.gap && p.reading < first.reading)) first = { gap, reading: p.reading };
  }
  if (!first) return null;
  const distance = latest.reading - first.reading;
  if (first.gap < minDays || distance <= 0) return null;
  return distance / first.gap;
}

export type UsageState = 'overdue' | 'soon' | 'ok' | 'unknown';

/** What a usage schedule needs: either interval, and when (and at what reading) it was last done. */
export interface UsageSchedule {
  everyMonths?: number;
  /** Every this many meter units (miles, kilometres, hours). */
  everyMeter?: number;
  lastDate?: Ymd;
  lastReading?: number;
}

export interface UsageDue {
  state: UsageState;
  /** The time-based due day, when it repeats by time and the last time is known. */
  dueDate: Ymd | null;
  /** Calendar days to `dueDate`; negative once it has passed. */
  daysLeft: number | null;
  /** The reading it is due at, when it repeats by the meter and the last reading is known. */
  dueAt: number | null;
  /** Meter units left to `dueAt` from the latest reading; negative once passed. */
  meterLeft: number | null;
  /** Days until `meterLeft` runs out at the recent pace. */
  meterDays: number | null;
  /** Days until due by whichever comes first; for sorting. Infinity when nothing is known. */
  sortDays: number;
}

export interface UsageOptions {
  /** Within this many days it counts as coming up soon (default 30). */
  soonDays?: number;
  /** Within this share of the meter interval it counts as soon (default 0.1). */
  soonShare?: number;
}

/**
 * When a usage schedule is next due: by time (every N months from the last time), by the meter
 * (every N units from the reading then), whichever comes first. `pace` (units per day, from
 * `dailyPace`) estimates the days the meter has left.
 */
export function usageDue(s: UsageSchedule, latest: MeterReading | null, pace: number | null, now: number, { soonDays = 30, soonShare = 0.1 }: UsageOptions = {}): UsageDue {
  const dueDate = s.everyMonths && s.lastDate ? addMonths(s.lastDate, s.everyMonths) : null;
  const daysLeft = dueDate ? daysUntil(dueDate, now) : null;
  const dueAt = s.everyMeter && s.lastReading !== undefined ? s.lastReading + s.everyMeter : null;
  const meterLeft = dueAt !== null && latest ? dueAt - latest.reading : null;
  // The pace estimate counts from the day of the latest reading, not from today.
  const meterDays =
    meterLeft !== null && pace && meterLeft > 0 && latest ? Math.max(0, Math.floor(meterLeft / pace) - Math.max(0, -daysUntil(latest.date, now))) : null;

  // Passing the due reading sorts like a day overdue: either way it needs doing now.
  const byMeter = meterLeft === null ? null : meterLeft < 0 ? -1 : meterLeft === 0 ? 0 : meterDays;
  const candidates = [daysLeft, byMeter].filter((d): d is number => d !== null);
  const sortDays = candidates.length ? Math.min(...candidates) : Number.POSITIVE_INFINITY;

  let state: UsageState;
  if (daysLeft === null && meterLeft === null) state = 'unknown';
  else if ((daysLeft !== null && daysLeft < 0) || (meterLeft !== null && meterLeft < 0)) state = 'overdue';
  else if (
    (daysLeft !== null && daysLeft <= soonDays) ||
    (meterDays !== null && meterDays <= soonDays) ||
    (meterLeft !== null && !!s.everyMeter && meterLeft <= s.everyMeter * soonShare)
  )
    state = 'soon';
  else state = 'ok';

  return { state, dueDate, daysLeft, dueAt, meterLeft, meterDays, sortDays };
}

/** The last-done fields a visit on `date` (at `reading`) writes, or null when the schedule has a later record. */
export function afterUsage(s: Pick<UsageSchedule, 'lastDate' | 'lastReading'>, date: Ymd, reading: number | undefined): Pick<UsageSchedule, 'lastDate' | 'lastReading'> | null {
  if (s.lastDate && s.lastDate > date) return null;
  return { lastDate: date, ...(reading !== undefined ? { lastReading: reading } : s.lastDate === date ? { lastReading: s.lastReading } : {}) };
}

/** "Every month", "Every 6 months", "Every year", "Every 2 years"; "Once" without an interval. */
export function describeMonths(everyMonths: number | undefined): string {
  if (!everyMonths) return 'Once';
  if (everyMonths === 12) return 'Every year';
  if (everyMonths % 12 === 0) return `Every ${everyMonths / 12} years`;
  return everyMonths === 1 ? 'Every month' : `Every ${everyMonths} months`;
}

// ---- Renewals ----

export type RenewalState = 'overdue' | 'soon' | 'ok';

/** Where a renewal stands: overdue once its day has passed, soon within `soonDays` (default 30). */
export function renewalDue(dueDate: Ymd, now: number, soonDays = 30): { state: RenewalState; days: number } {
  const days = daysUntil(dueDate, now);
  return { state: days < 0 ? 'overdue' : days <= soonDays ? 'soon' : 'ok', days };
}

/**
 * The due date after renewing: `everyMonths` on from the old due date (the anniversary stays put),
 * stepping past today if it was renewed very late. Null when it doesn't repeat.
 */
export function nextRenewal(dueDate: Ymd, everyMonths: number | undefined, now: number): Ymd | null {
  if (!everyMonths) return null;
  const today = toYmd(now);
  // Counted from the original date each step, so a 31st stays the 31st where the month has one.
  let k = 1;
  let next = addMonths(dueDate, everyMonths);
  while (next <= today && k < 1200) next = addMonths(dueDate, everyMonths * ++k);
  return next;
}

// ---- Events: things that happen on a schedule, done or not ----

export type EventFreq = 'week' | 'month' | 'year';
export const EVENT_FREQS: readonly EventFreq[] = ['week', 'month', 'year'];

/** Which weekday of the month: the first to the fourth, or -1 for the last. */
export type Nth = 1 | 2 | 3 | 4 | -1;
export const NTHS: readonly Nth[] = [1, 2, 3, 4, -1];

/**
 * When an event happens. Holidays are not built in: a holiday that shifts one occurrence is a
 * change to that occurrence (`OccurrenceChanges`), entered as data.
 *
 * - `week`: every `every` weeks on `days` (weekdays, 0 = Sunday; default `start`'s), counting
 *   weeks (Sunday to Saturday) from the week of `start`. "Every Thursday", "every other Friday",
 *   "every Monday and Thursday".
 * - `month`: every `every` months from `start`'s month, on `start`'s day of the month (the 31st
 *   falls on the last day of shorter months), or with `nth` on the nth `weekday` ("the third
 *   Tuesday", -1 "the last Friday").
 * - `year`: every `every` years on `start`'s month and day (29 February falls on the 28th).
 *
 * Nothing happens before `start` or after `until`.
 */
export interface EventRule {
  freq: EventFreq;
  every: number;
  start: Ymd;
  days?: number[];
  nth?: Nth;
  weekday?: number;
  until?: Ymd;
}

export const EVENT_RULE_KEYS = ['freq', 'every', 'start', 'days', 'nth', 'weekday', 'until'] as const;

const isWeekday = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6;

/** Whether a stored value is an event rule the apps (and the rules) accept. */
export function isEventRule(v: unknown): v is EventRule {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (Object.keys(r).some((k) => !(EVENT_RULE_KEYS as readonly string[]).includes(k))) return false;
  if (!EVENT_FREQS.includes(r.freq as EventFreq)) return false;
  if (!Number.isInteger(r.every) || (r.every as number) < 1 || (r.every as number) > MAX_EVERY) return false;
  if (!isYmd(r.start)) return false;
  if (r.until !== undefined && (!isYmd(r.until) || (r.until as string) < (r.start as string))) return false;
  if (r.days !== undefined && (r.freq !== 'week' || !Array.isArray(r.days) || r.days.length < 1 || r.days.length > 7 || !r.days.every(isWeekday))) return false;
  if ((r.nth === undefined) !== (r.weekday === undefined)) return false;
  if (r.nth !== undefined && (r.freq !== 'month' || !NTHS.includes(r.nth as Nth) || !isWeekday(r.weekday))) return false;
  return true;
}

/** The rule as stored: known keys only, days sorted and unique, defaults left out. */
export function cleanRule(rule: EventRule): EventRule {
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
export function nthWeekday(y: number, m: number, nth: Nth, wd: number): Ymd {
  if (nth === -1) {
    const last = daysInMonth(y, m);
    const back = (weekday(ymd(y, m, last)) - wd + 7) % 7;
    return ymd(y, m, last - back);
  }
  const first = (wd - weekday(ymd(y, m, 1)) + 7) % 7;
  return ymd(y, m, 1 + first + 7 * (nth - 1));
}

/** Which weekday of its month a day is: the 3rd Tuesday, and whether it is also the last one. */
export function weekdayOfMonth(day: Ymd): { nth: 1 | 2 | 3 | 4 | 5; weekday: number; last: boolean } {
  const p = ymdParts(day)!;
  return { nth: Math.ceil(p.d / 7) as 1 | 2 | 3 | 4 | 5, weekday: weekday(day), last: p.d + 7 > daysInMonth(p.y, p.m) };
}

const monthIndex = (day: Ymd) => {
  const p = ymdParts(day)!;
  return p.y * 12 + (p.m - 1);
};

/** The rule's day in the month at `index` (year * 12 + month - 1). */
function dayInMonth(rule: EventRule, index: number): Ymd {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  if (rule.freq === 'month' && rule.nth !== undefined && rule.weekday !== undefined) return nthWeekday(y, m, rule.nth, rule.weekday);
  return ymd(y, m, Math.min(ymdParts(rule.start)!.d, daysInMonth(y, m)));
}

/** Every day the rule happens from `from` to `to`, both included, soonest first (at most 1000). */
export function ruleOccurrences(rule: EventRule, from: Ymd, to: Ymd): Ymd[] {
  const first = from > rule.start ? from : rule.start;
  const last = rule.until && rule.until < to ? rule.until : to;
  const out: Ymd[] = [];
  if (first > last) return out;
  if (rule.freq === 'week') {
    const days = rule.days?.length ? rule.days : [weekday(rule.start)];
    const weekOne = addDays(rule.start, -weekday(rule.start));
    // Jump to the first week that counts, then walk its days.
    let week = Math.floor(daysBetween(weekOne, first) / 7);
    week += (rule.every - (week % rule.every)) % rule.every;
    for (; out.length < 1000; week += rule.every) {
      const sunday = addDays(weekOne, week * 7);
      if (sunday > last) break;
      for (const wd of [...days].sort((a, b) => a - b)) {
        const d = addDays(sunday, wd);
        if (d >= first && d <= last) out.push(d);
      }
    }
    return out;
  }
  const step = rule.freq === 'year' ? 12 * rule.every : rule.every;
  const start = monthIndex(rule.start);
  let k = Math.max(0, Math.floor((monthIndex(first) - start) / step));
  for (; out.length < 1000; k++) {
    const index = start + k * step;
    if (index > monthIndex(last)) break;
    const d = dayInMonth(rule, index);
    if (d >= first && d <= last) out.push(d);
  }
  return out;
}

/** Whether the rule happens on `day`. */
export const happensOn = (rule: EventRule, day: Ymd): boolean => isYmd(day) && ruleOccurrences(rule, day, day).length === 1;

const ORDINAL_WORDS: Record<Nth, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' } as Record<Nth, string>;

function dayList(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'day';
  if (sorted.join() === '1,2,3,4,5') return 'weekday';
  const names = sorted.map((d) => WEEKDAYS[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * "Every Thursday", "Every other Friday", "Every 3 weeks on Monday", "Every Monday and Thursday",
 * "Every month on the 15th", "Every month on the third Tuesday", "Every 2 months on the last
 * Friday", "Every year on November 2".
 */
export function describeRule(rule: EventRule): string {
  const n = rule.every;
  if (rule.freq === 'week') {
    const days = dayList(rule.days?.length ? rule.days : [weekday(rule.start)]);
    if (n === 1) return `Every ${days}`;
    if (n === 2) return `Every other ${days}`;
    return `Every ${n} weeks on ${days === 'day' ? 'every day' : days === 'weekday' ? 'weekdays' : days}`;
  }
  if (rule.freq === 'month') {
    const on = rule.nth !== undefined && rule.weekday !== undefined ? `the ${ORDINAL_WORDS[rule.nth]} ${WEEKDAYS[rule.weekday]}` : `the ${ordinal(ymdParts(rule.start)!.d)}`;
    return `${n === 1 ? 'Every month' : n === 2 ? 'Every other month' : `Every ${n} months`} on ${on}`;
  }
  const p = ymdParts(rule.start)!;
  return `${n === 1 ? 'Every year' : `Every ${n} years`} on ${MONTHS[p.m - 1]} ${p.d}`;
}

// ---- Changes to one occurrence ----

/** One occurrence changed: moved to another day (and time), or skipped, with an optional note ("Holiday week"). */
export interface OccurrenceChange {
  moved?: { date: Ymd; time?: Hhmm };
  skipped?: true;
  note?: string;
}

/** Changes keyed by the day the occurrence was originally on, so the schedule itself never changes. */
export type OccurrenceChanges = Record<Ymd, OccurrenceChange>;

/** At most this many changes are kept per event (the rules check the same); the oldest go first. */
export const MAX_CHANGES = 100;
export const NOTE_MAX = 200;

/** One occurrence as it will happen. */
export interface Occurrence {
  /** The day the schedule puts it on: the key of its change, and its id among the event's occurrences. */
  original: Ymd;
  /** The day it happens: `original`, or the day it was moved to. */
  date: Ymd;
  /** The time of day it happens, when it has one. */
  time?: Hhmm;
  moved: boolean;
  skipped: boolean;
  note?: string;
}

/** A stored change read defensively: null when it says nothing usable. */
export function toChange(v: unknown): OccurrenceChange | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  const m = c.moved as Record<string, unknown> | undefined;
  const moved = m && typeof m === 'object' && isYmd(m.date) ? { date: m.date as Ymd, ...(isHhmm(m.time) ? { time: m.time as Hhmm } : {}) } : undefined;
  const note = typeof c.note === 'string' && c.note.trim() ? c.note.trim().slice(0, NOTE_MAX) : undefined;
  if (!moved && c.skipped !== true) return null;
  return { ...(c.skipped === true ? { skipped: true as const } : moved ? { moved } : {}), ...(note ? { note } : {}) };
}

/** How far an occurrence may be moved, in days either way, so a window search finds every moved one. */
export const MAX_MOVE_DAYS = 31;

export interface OccurrenceOptions {
  /** The event's usual time of day; all day without one. */
  time?: Hhmm;
  changes?: OccurrenceChanges | null;
  /** Also return skipped occurrences (marked `skipped`), on their original day. Default false. */
  includeSkipped?: boolean;
}

/**
 * The occurrences that happen from `from` to `to` (both included, by the day they happen on), with
 * each one's change applied: a moved one appears on its new day, even when its original day is
 * outside the window, and a skipped one is left out (or kept, marked, with `includeSkipped`).
 * Changes keyed by a day the rule doesn't happen on are ignored. Soonest first, then by time.
 */
export function eventOccurrences(rule: EventRule, from: Ymd, to: Ymd, { time, changes, includeSkipped = false }: OccurrenceOptions = {}): Occurrence[] {
  const originals = ruleOccurrences(rule, addDays(from, -MAX_MOVE_DAYS), addDays(to, MAX_MOVE_DAYS));
  const out: Occurrence[] = [];
  for (const original of originals) {
    const change = changes ? toChange(changes[original]) : null;
    const base = { original, moved: false, skipped: false, ...(change?.note ? { note: change.note } : {}) };
    if (change?.skipped) {
      if (includeSkipped && original >= from && original <= to) out.push({ ...base, date: original, ...(time ? { time } : {}), skipped: true });
      continue;
    }
    if (change?.moved) {
      const { date, time: movedTime } = change.moved;
      if (date >= from && date <= to) out.push({ ...base, date, ...((movedTime ?? time) ? { time: movedTime ?? time } : {}), moved: true });
      continue;
    }
    if (original >= from && original <= to) out.push({ ...base, date: original, ...(time ? { time } : {}) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0));
}

/** The next occurrence that happens on or after `today` (skipped ones passed over), within `withinDays` (default 400). */
export function nextOccurrence(rule: EventRule, today: Ymd, options: Omit<OccurrenceOptions, 'includeSkipped'> & { withinDays?: number } = {}): Occurrence | null {
  return eventOccurrences(rule, today, addDays(today, options.withinDays ?? 400), options)[0] ?? null;
}

/** When an occurrence starts: its time on its day, or local midnight when it is all day. */
export const occurrenceStart = (o: Pick<Occurrence, 'date' | 'time'>): number => atTime(o.date, o.time);

/** Changes with one more: `change` null clears it. Keeps at most `MAX_CHANGES`, dropping the oldest days first. */
export function withChange(changes: OccurrenceChanges | null | undefined, original: Ymd, change: OccurrenceChange | null): OccurrenceChanges {
  const next: OccurrenceChanges = {};
  for (const [day, c] of Object.entries(changes ?? {})) {
    const clean = isYmd(day) ? toChange(c) : null;
    if (clean && day !== original) next[day] = clean;
  }
  const clean = change ? toChange(change) : null;
  // Moving one back to its own day at the usual time is no change at all.
  if (clean && !(clean.moved && clean.moved.date === original && !clean.moved.time && !clean.note)) next[original] = clean;
  const days = Object.keys(next).sort();
  for (const day of days.slice(0, Math.max(0, days.length - MAX_CHANGES))) delete next[day];
  return next;
}

/** Changes for occurrences before `keepFrom` dropped: what is past no longer needs remembering. */
export function pruneChanges(changes: OccurrenceChanges | null | undefined, keepFrom: Ymd): OccurrenceChanges {
  return Object.fromEntries(
    Object.entries(changes ?? {}).filter(([day, c]) => {
      const clean = toChange(c);
      return !!clean && (day >= keepFrom || (!!clean.moved && clean.moved.date >= keepFrom));
    }),
  );
}

// ---- Something to do before: put the bins out the evening before ----

/** When the thing to do before is due: `daysBefore` the occurrence's day (0, the day itself), at `time`. */
export interface PrepOffset {
  daysBefore: number;
  time: Hhmm;
}

export const MAX_PREP_DAYS = 14;

export const isPrepOffset = (v: unknown): v is PrepOffset => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Object.keys(o).every((k) => k === 'daysBefore' || k === 'time') && Number.isInteger(o.daysBefore) && (o.daysBefore as number) >= 0 && (o.daysBefore as number) <= MAX_PREP_DAYS && isHhmm(o.time);
};

/** The usual ones, for a picker: the evening before, the morning of. */
export const PREP_PRESETS: readonly { label: string; offset: PrepOffset }[] = [
  { label: 'The evening before', offset: { daysBefore: 1, time: '19:00' } },
  { label: 'The morning of', offset: { daysBefore: 0, time: '07:00' } },
  { label: 'The day before', offset: { daysBefore: 1, time: '09:00' } },
];

/** "The evening before at 7 PM", "The morning of, by 7 AM", "2 days before at 9 AM", "The day before at 12 PM". */
export function describePrep(offset: PrepOffset): string {
  const at = clockWords(offset.time);
  const hour = Number(offset.time.slice(0, 2));
  if (offset.daysBefore === 0) return hour < 12 ? `The morning of, by ${at}` : `The same day, by ${at}`;
  if (offset.daysBefore === 1) return hour >= 17 ? `The evening before at ${at}` : `The day before at ${at}`;
  return `${offset.daysBefore} days before at ${at}`;
}

/**
 * The thing to do before an occurrence: due at `deadline`, and missed at `missedAt`, when the
 * event begins (or, for an all-day event or one before the deadline, at the end of its day).
 */
export function prepWindow(o: Pick<Occurrence, 'date' | 'time'>, offset: PrepOffset): { day: Ymd; deadline: number; missedAt: number } {
  const day = addDays(o.date, -offset.daysBefore);
  const deadline = atTime(day, offset.time);
  const begins = occurrenceStart(o);
  return { day, deadline, missedAt: o.time && begins > deadline ? begins : atTime(addDays(o.date, 1)) };
}

/**
 * Where a thing to do before stands: `later`; `soon` within `leadHours` (default 24) of its
 * deadline, when it belongs on a to-do list; `due` once the deadline has passed but it can still
 * be done; `missed` once the event has begun; `done`.
 */
export type PrepState = 'later' | 'soon' | 'due' | 'missed' | 'done';

export function prepState(window: { deadline: number; missedAt: number }, now: number, done: boolean, leadHours = 24): PrepState {
  if (done) return 'done';
  if (now >= window.missedAt) return 'missed';
  if (now >= window.deadline) return 'due';
  return window.deadline - now <= leadHours * HOUR ? 'soon' : 'later';
}

/** "tonight by 7 PM", "today by 7 AM", "tomorrow by 7 PM", "Wednesday by 7 PM", "Oct 22 by 7 PM". */
export function prepWhen(deadline: number, now: number): string {
  const day = toYmd(deadline);
  const today = toYmd(now);
  const by = `by ${clockWords(toHhmm(deadline))}`;
  const n = daysBetween(today, day);
  if (n === 0) return `${new Date(deadline).getHours() >= 17 ? 'tonight' : 'today'} ${by}`;
  if (n === 1) return `tomorrow ${by}`;
  if (n > 1 && n < 7) return `${WEEKDAYS[weekday(day)]} ${by}`;
  return `${shortDate(day, today)} ${by}`;
}

// ---- Recognising a schedule from dates (calendar imports) ----

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The rule a handful of dates follow, or null when they follow none: the occurrences of a repeating
 * calendar event, say. Weekly (the same weekday, every N weeks: the largest step every gap is a
 * multiple of, so a skipped holiday week doesn't break it), monthly on the same day or the same
 * nth weekday, or yearly. Needs at least two different dates; starts on the first.
 */
export function inferRule(dates: Ymd[]): EventRule | null {
  const days = [...new Set(dates.filter(isYmd))].sort();
  if (days.length < 2) return null;
  const start = days[0];
  const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
  const weeks = gaps.every((g) => g % 7 === 0) ? gaps.map((g) => g / 7).reduce(gcd) : 0;
  // Every week to every 3 weeks reads as weekly; four-week gaps may be "the second Tuesday", so a
  // monthly pattern wins over those.
  if (weeks >= 1 && weeks <= 3) return { freq: 'week', every: weeks, start };
  const monthly = monthlyRule(days);
  if (monthly) return monthly;
  return weeks >= 1 && weeks <= 8 ? { freq: 'week', every: weeks, start } : null;
}

function monthlyRule(days: Ymd[]): EventRule | null {
  const start = days[0];
  const months = days.slice(1).map((d, i) => monthIndex(d) - monthIndex(days[i]));
  if (!months.every((m) => m > 0)) return null;
  const step = months.reduce(gcd);
  if (step > MAX_EVERY) return null;
  const p = ymdParts(start)!;
  if (step % 12 === 0 && days.every((d) => d.slice(5) === start.slice(5))) return { freq: 'year', every: step / 12, start };
  const sameDay = (d: Ymd) => {
    const x = ymdParts(d)!;
    return x.d === Math.min(p.d, daysInMonth(x.y, x.m));
  };
  if (days.every(sameDay)) return { freq: 'month', every: step, start };
  const w = weekdayOfMonth(start);
  if (w.nth <= 4 && days.every((d) => weekdayOfMonth(d).weekday === w.weekday && weekdayOfMonth(d).nth === w.nth))
    return { freq: 'month', every: step, start, nth: w.nth as Nth, weekday: w.weekday };
  if (w.last && days.every((d) => weekdayOfMonth(d).weekday === w.weekday && weekdayOfMonth(d).last)) return { freq: 'month', every: step, start, nth: -1, weekday: w.weekday };
  return null;
}

/** Something to do before each occurrence ("Take the garbage out"), when, and whether to send a reminder then. */
export interface EventPrep {
  title: string;
  offset: PrepOffset;
  remind: boolean;
}

export const PREP_TITLE_MAX = 120;

export const isEventPrep = (v: unknown): v is EventPrep => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    Object.keys(p).every((k) => k === 'title' || k === 'offset' || k === 'remind') &&
    typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= PREP_TITLE_MAX &&
    isPrepOffset(p.offset) && typeof p.remind === 'boolean'
  );
};
