import { type Adherence, type DoseLog, type ScheduleCourse, type SlotStatus } from '../dose.js';
import { cleanRule, isEventRule, type EventRule } from '../schedule.js';
import { type Ymd } from '../time.js';
import type { ToolContext } from './registry.js';
/**
 * Huishouden Health's people, medicines and doses, read as the person may (admins everyone, carers
 * and the person themself their own; kids and other members nothing), and the app's own logic
 * ported from health src/lib/meds.ts: schedules, supply, refills, the double-dose and as-needed
 * guards, adherence. Every time given to the kit is in the local frame (../clock), so slot keys
 * ("2031-01-05T08:00") and days are the person's own, as on their phone.
 */
export interface Person {
    id: string;
    name: string;
    birthDate?: Ymd;
    email?: string;
    carers: string[];
    readers: string[];
    allergies?: string;
    notes?: string;
}
export interface Med {
    id: string;
    personId: string;
    name: string;
    strength?: string;
    dose?: string;
    doseAmount?: number;
    doseUnit?: string;
    asNeeded: boolean;
    times: string[];
    everyDays?: number;
    rule?: EventRule;
    minHours?: number;
    maxPerDay?: number;
    withFood?: boolean;
    startDate: Ymd;
    endDate?: Ymd;
    prescriberId?: string;
    pharmacyId?: string;
    refills?: number;
    supply?: number;
    supplyAt?: number;
    refillOrderedAt?: number;
    escalateMinutes: number;
    remind: boolean;
    notes?: string;
    createdAt: number;
    by: string;
}
/** A dose record; `at` absolute. */
export interface Dose extends DoseLog {
    id: string;
    medId: string;
    personId: string;
    slot?: string;
    at: number;
    status: 'given' | 'skipped';
    note?: string;
    by: string;
}
/** A dose is due from 30 minutes before its time until two hours after; then it is missed (health meds.ts WINDOW). */
export declare const WINDOW: {
    earlyMinutes: number;
    graceMinutes: number;
};
export declare const LOW_SUPPLY_DAYS = 7;
export declare const DEFAULT_ESCALATE_MINUTES = 30;
export declare function toPerson(id: string, d: Record<string, unknown>): Person;
export declare function toMed(id: string, d: Record<string, unknown>): Med;
export declare function toDose(id: string, d: Record<string, unknown>): Dose;
/** The people this person may read: everyone for admins, else those listing them as a reader; kids none. */
export declare function loadPeople(ctx: ToolContext): Promise<Person[]>;
export declare function loadMeds(ctx: ToolContext, person: Person): Promise<Med[]>;
/** Doses since `since` (absolute ms). */
export declare function loadDoses(ctx: ToolContext, person: Person, since: number): Promise<Dose[]>;
export declare const personUrl: (ctx: ToolContext, personId: string, tab?: string) => string;
export declare const medUrl: (ctx: ToolContext, med: Pick<Med, "id" | "personId">) => string;
export declare const printUrl: (ctx: ToolContext, personId: string) => string;
/** Same id for the same slot from any device (health meds.ts `doseId`). */
export declare const doseId: (medId: string, slot: string) => string;
export declare function scheduleOf(m: Med): ScheduleCourse;
/** Logs in the local frame, for the kit's day and slot logic. */
export declare const localLogs: (ctx: ToolContext, doses: readonly Dose[]) => Dose[];
export declare const logsOf: <D extends {
    medId: string;
}>(doses: readonly D[], medId: string) => D[];
/** `today` and every `Ymd` here are local; `localNow` local-frame ms. */
export declare const isStopped: (m: Pick<Med, "endDate">, today: Ymd) => boolean;
export declare const isCurrent: (m: Pick<Med, "startDate" | "endDate">, day: Ymd) => boolean;
export declare function supplyLeft(m: Med, doses: readonly Dose[]): number | null;
/** Units used on an average day: scheduled doses over the next four weeks, or as needed the last two. Local-frame `localNow`, absolute `now`. */
export declare function dailyUse(m: Med, doses: readonly Dose[], now: number, localNow: number): number | null;
export declare function daysLeft(m: Med, doses: readonly Dose[], now: number, localNow: number): number | null;
export declare function refillDue(m: Med, doses: readonly Dose[], now: number, localNow: number): boolean;
export declare const medLabel: (m: Pick<Med, "name" | "strength">) => string;
export declare function scheduleText(m: Med): string;
export declare const doseText: (m: Pick<Med, "dose" | "withFood">) => string;
export declare function daysLeftText(days: number): string;
export declare function ageOn(birthDate: Ymd | undefined, today: Ymd): number | null;
/** The scheduled doses of current medicines from `fromDay` to `toDay` (local days), with what happened. */
export declare function rowsBetween(ctx: ToolContext, meds: readonly Med[], doses: readonly Dose[], fromDay: Ymd, toDay: Ymd): (SlotStatus<Dose> & {
    med: Med;
})[];
export declare function adherenceOf(ctx: ToolContext, m: Med, doses: readonly Dose[], fromDay: Ymd, toDay: Ymd): Adherence;
/**
 * The app's warning before a dose is marked given (health meds.ts `guardFor`): as needed, too soon
 * or too many in 24 hours; scheduled, that slot (or any dose within half the gap between doses)
 * already given. Health asks and lets the carer give it anyway; so does the connector, through
 * `confirm`. Call inside `render`.
 */
export declare function guardFor(ctx: ToolContext, m: Med, doses: readonly Dose[], at: number, nameOf: (email: string) => string, slot?: string): string | null;
export { cleanRule, isEventRule };
