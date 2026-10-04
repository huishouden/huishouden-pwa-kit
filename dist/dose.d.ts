/**
 * Medicine labels to dose schedules. A photo of a pharmacy or vet label is read on the device
 * (`readLabel`, open-source OCR, nothing uploaded or stored), the directions are parsed with fixed
 * rules (`parseDirections`), and the result becomes daily dose times and reminders.
 *
 * The parser never guesses silently: wording it does not recognise comes back in `unparsed`,
 * and every assumption it makes (a month read as 30 days, only the first step of a taper) comes
 * back in `assumptions`, so the app can show them next to the fields it filled in.
 */
import { type ReadTextOptions } from './ocr';
import { type EventRule } from './schedule';
export { OCR_LANG_PATH, releaseOcr } from './ocr';
export type ReadLabelOptions = Omit<ReadTextOptions, 'screenshot'>;
/**
 * The text on a label photo, read on the device with tesseract.js (English; see `./ocr`). The
 * engine is loaded on first use only, so apps that never call this don't download it. Accuracy
 * depends on the photo: flat, well lit and in focus.
 */
export declare function readLabel(image: Blob, options?: ReadLabelOptions): Promise<string>;
export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'bedtime';
export interface ParsedCourse {
    /** Medicine name from the label's drug line ("Carprofen"). */
    name?: string;
    /** Strength from the drug line or the directions ("75 mg", "1.5 mg/ml"). */
    strength?: string;
    /** Form from the drug line ("chewable tablets", "oral suspension"). */
    form?: string;
    /** One dose, normalised: "1 tablet", "0.5 ml", "2 drops". */
    dose?: string;
    doseAmount?: number;
    /** Singular unit: "tablet", "capsule", "ml", "drop", "mg". */
    doseUnit?: string;
    /** Doses per dosing day. */
    timesPerDay?: number;
    /** Hours between doses when the label gives an interval ("every 8 hours"; 48 = every other day). */
    intervalHours?: number;
    /** Times of day the label names ("in the morning and at bedtime"). */
    timesOfDay?: TimeOfDay[];
    /** Course length in days. */
    days?: number;
    /** "Until gone" / "until finished": no fixed length. */
    untilGone?: boolean;
    /** true: with food or after meals; false: on an empty stomach. */
    withFood?: boolean;
    /** "As needed" / PRN: no schedule. */
    asNeeded?: boolean;
    /** "by mouth", "in each eye", "in the left ear", "to the affected area". */
    route?: string;
    /** Who it is for, from a "Pet:" or "Patient:" line. */
    patient?: string;
    /** Advice lines the app can keep as notes ("Shake well", "Refrigerate"). */
    notes: string[];
    /** 0..1, how much of a usable schedule was found (see `confidenceOf`). */
    confidence: number;
    /** Text the parser did not understand, for the app to show. Never dropped silently. */
    unparsed: string[];
    /** Readings the parser made that the person should confirm. */
    assumptions: string[];
    /** Label lines recognised as pharmacy boilerplate (Rx number, quantity, refills, prescriber, address). */
    ignored: string[];
}
/** "1 1/2", "1/2", "0.5", "one-half", "two" → number. */
export declare function parseNumber(text: string): number | undefined;
/** "0.5 ml", "1 tablet", "2 drops", "1.5 tablets" ("2 tabletas", "2 tabletten"), in the active language. `unit` is the parser's singular English unit. */
export declare function formatDose(amount: number, unit: string): string;
/**
 * A dose schedule from a label's text or typed directions: "Give 1 tablet by mouth every 12 hours
 * with food for 7 days". Handles once/twice/three/four times daily, every N hours, SID/BID/TID/QID,
 * qNh, QD, QAM/QPM/QHS, every other day, weekly, morning/evening/bedtime, for N days/weeks, until
 * gone, as needed, with food or an empty stomach, and doses in tablets, capsules, ml, drops and
 * more. Anything else is returned in `unparsed`.
 */
export declare function parseDirections(text: string): ParsedCourse;
/**
 * How much of a usable course was found, 0..1: a schedule (0.4), a dose (0.2), a length or "until
 * gone" (0.15), a name (0.15), and with any of those, nothing left unparsed (0.1); each assumption costs 0.1.
 */
export declare function confidenceOf(c: ParsedCourse): number;
/** Clock times ("HH:MM", local) the household uses for each part of the day. */
export interface DayTimes {
    morning: string;
    midday: string;
    evening: string;
    bedtime: string;
}
export declare const DEFAULT_DAY_TIMES: DayTimes;
export interface DoseTimesOptions {
    defaultTimes?: Partial<DayTimes>;
    /** First dose of the day for interval schedules. Default: the morning time. */
    firstDose?: string;
}
/**
 * The clock times of each dosing day: the named times of day if the label gives them, evenly
 * spaced from the first dose for an interval, otherwise spread from morning to evening
 * (twice daily: 08:00 and 20:00; three times: 08:00, 14:00, 20:00). As needed: none.
 */
export declare function doseTimes(course: Pick<ParsedCourse, 'timesPerDay' | 'intervalHours' | 'timesOfDay' | 'asNeeded'>, options?: DoseTimesOptions): string[];
/** "YYYY-MM-DD" in local time. */
export declare function ymd(date: Date): string;
/** The dosing dates of a course: `days` days from `start`, every `everyDays` days (2 = every other day). */
export declare function courseDays(start: string, days: number, everyDays?: number): string[];
/** The course model apps store (Huishouden Pet's medicine courses). */
export interface MedCourse {
    name: string;
    dose: string;
    timesPerDay: number;
    /** "HH:MM" local, sorted. */
    times: string[];
    /** "YYYY-MM-DD". */
    startDate: string;
    /** Length in days; absent for ongoing or until-gone courses. */
    days?: number;
    withFood?: boolean;
    notes: string;
}
/**
 * A parsed label as the course an app stores, ready for the person to check: the name includes
 * the strength, the times come from `doseTimes`, and everything the course fields can't hold
 * (interval, until gone, as needed, route, the label's advice) goes into `notes`.
 */
export declare function toMedCourse(parsed: ParsedCourse, options: DoseTimesOptions & {
    startDate: string;
}): MedCourse;
export interface DoseSlot {
    /** "YYYY-MM-DD" local. */
    date: string;
    /** "HH:MM" local. */
    time: string;
    /** ms since epoch. */
    at: number;
    /** Stable id of this dose, "YYYY-MM-DDTHH:MM", for recording it as given. */
    key: string;
}
export interface ScheduleCourse {
    startDate: string;
    days?: number;
    times: string[];
    /** Days between dosing days: 2 for every other day. Default 1. */
    everyDays?: number;
    /**
     * Dosing days on a calendar pattern instead (`./schedule` `EventRule`: Mondays and Thursdays, the
     * 1st of each month); `everyDays` is then ignored. Days before `startDate` never count.
     */
    rule?: EventRule;
    /** "YYYY-MM-DD", the last dosing day (a medicine stopped or prescribed until a date). */
    until?: string;
}
/**
 * Every dose of a course between `from` and `to` (ms, inclusive), in order. Ongoing courses (no
 * `days` or `until`) run until `to`.
 */
export declare function doseSlots(course: ScheduleCourse, from: number, to: number): DoseSlot[];
export type DoseState = 'given' | 'due' | 'missed' | 'upcoming';
export interface DoseWindow {
    /** A dose is due from this many minutes before its time. Default 30. */
    earlyMinutes?: number;
    /** ...until this many minutes after; later it is missed. Default 120. */
    graceMinutes?: number;
}
/** Whether one dose has been given, is due now, was missed, or is still ahead. */
export declare function doseState(slot: DoseSlot, given: ReadonlySet<string> | readonly string[], now: number, window?: DoseWindow): DoseState;
export interface DoseSummary {
    due: DoseSlot[];
    missed: DoseSlot[];
    next?: DoseSlot;
}
/**
 * The doses due now, those missed since `since` (default: the course start), and the next one,
 * given the keys of doses already recorded as given.
 */
export declare function doseSummary(course: ScheduleCourse, given: readonly string[], now: number, options?: DoseWindow & {
    since?: number;
}): DoseSummary;
/** Days between dosing days for a parsed interval (48 h → 2), for `ScheduleCourse.everyDays`. */
export declare function everyDaysOf(course: Pick<ParsedCourse, 'intervalHours'>): number;
/** A dose someone recorded: given, or skipped on purpose. `slot` is the `DoseSlot.key` it answers (none for as-needed). */
export interface DoseLog {
    at: number;
    slot?: string;
    status: 'given' | 'skipped';
    by?: string;
}
/** The slot keys that have been answered, given or skipped: nothing more is due for them. */
export declare function handledKeys(logs: readonly DoseLog[]): Set<string>;
export type SlotState = 'given' | 'skipped' | 'due' | 'missed' | 'upcoming';
export interface SlotStatus<L extends DoseLog = DoseLog> {
    slot: DoseSlot;
    state: SlotState;
    /** The log that answered it (the given one if a slot was logged both ways). */
    log?: L;
}
/** Each slot of a course between `from` and `to` with what happened to it, in order. */
export declare function slotStatuses<L extends DoseLog>(course: ScheduleCourse, logs: readonly L[], from: number, to: number, now: number, window?: DoseWindow): SlotStatus<L>[];
export interface Adherence {
    given: number;
    skipped: number;
    missed: number;
    /** Doses of the period nobody has answered yet that are still due. */
    due: number;
    /** Given out of given and missed (skipped on purpose doesn't count against it); null with nothing to count. */
    rate: number | null;
}
/** How a scheduled course went between `from` and `to` (capped at now): given, skipped and missed doses. */
export declare function adherence(course: ScheduleCourse, logs: readonly DoseLog[], from: number, to: number, now: number, window?: DoseWindow): Adherence;
/**
 * How close two doses of a scheduled medicine may be before a second one looks like a double dose:
 * half the shortest gap between its dose times (across midnight too), at least an hour and at most
 * 12 hours. Once a day: 12 hours.
 */
export declare function doubleDoseWindowMs(times: readonly string[]): number;
/** The latest dose given within `withinMs` before `now` (or after it, for a time typed ahead), if any. */
export declare function recentlyGiven<L extends DoseLog>(logs: readonly L[], now: number, withinMs: number): L | undefined;
export interface AsNeededLimits {
    /** Hours to wait between doses. */
    minHours?: number;
    /** Doses allowed in any 24 hours. */
    maxPerDay?: number;
}
export interface AsNeededCheck {
    /** Whether a dose now keeps within the limits. */
    ok: boolean;
    /** `too-soon`: less than `minHours` since the last; `max-reached`: `maxPerDay` given in the last 24 hours. */
    reason?: 'too-soon' | 'max-reached';
    /** The last dose given before now. */
    last?: number;
    /** Doses given in the 24 hours before now. */
    inLastDay: number;
    /** The earliest moment a dose keeps within both limits (now when `ok`). */
    nextAt: number;
}
/**
 * Whether an as-needed medicine ("every 4 to 6 hours as needed, no more than 4 in 24 hours") may be
 * given at `now`, from the doses given. Advice for the person giving it, never a block: the app
 * says why and lets them go ahead.
 */
export declare function asNeededCheck(logs: readonly DoseLog[], now: number, { minHours, maxPerDay }: AsNeededLimits): AsNeededCheck;
