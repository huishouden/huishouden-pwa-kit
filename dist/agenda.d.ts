import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type Ymd } from './time.js';
/**
 * The household's agenda: dated things from every app in one collection,
 * `households/{id}/agenda`, so the portal can show one calendar and a Today view without reading
 * any app's own collections. Each app publishes its items here (appointments, due jobs, bills,
 * renewals) and keeps them current; the portal only reads.
 *
 * Admins and members read every item; helpers and kids (`./roles`) only those with `private: false`,
 * so an item from a private appointment, or from Spending or Bills, is published `private: true`.
 * Every item is written with the flag: one without it counts as private to helpers and kids.
 * Fields match the rules exactly (see AGENDA_FIELDS); keep them in step.
 */
export type AgendaKind = 'appointment' | 'due' | 'renewal' | 'bill' | 'birthday' | 'medicine' | 'feeding' | 'task' | 'other';
export declare const AGENDA_KINDS: readonly AgendaKind[];
/**
 * For things someone has to do (a job, a bill, a dose): `upcoming` until done, `overdue` once its day
 * has passed, `done`. Leave it out for things that simply happen (an appointment, a birthday).
 */
export type AgendaStatus = 'upcoming' | 'overdue' | 'done';
export declare const AGENDA_STATUSES: readonly AgendaStatus[];
export interface AgendaItem {
    id: string;
    /** The app's repo short name ("home"). */
    app: string;
    /** The source record within the app ("job:abc", "appointment:xyz"); one record may give several items. */
    ref: string;
    kind: AgendaKind;
    title: string;
    /** ms since epoch. All-day items start at local midnight of their day. */
    start: number;
    /** ms since epoch, after `start`. All-day items end at local midnight after their last day. */
    end?: number;
    allDay: boolean;
    /** One short line: a place, an amount, "autopay on". */
    detail?: string;
    /** https deep link to the record in the app. */
    url: string;
    /** Who or what it is for: a pet, a person, a car. */
    who?: string;
    status?: AgendaStatus;
    /** Only admins and members see it: from a private record, or about money. Stored as a boolean. */
    private?: boolean;
    updatedAt: number;
    /** Lowercase email of the member whose app wrote it. */
    by: string;
}
export declare const AGENDA_FIELDS: readonly ["app", "ref", "kind", "title", "start", "end", "allDay", "detail", "url", "who", "status", "private", "updatedAt", "by"];
/** Maximum lengths, the same as the rules. */
export declare const AGENDA_LIMITS: {
    readonly app: 40;
    readonly ref: 200;
    readonly title: 120;
    readonly detail: 200;
    readonly url: 2000;
    readonly who: 60;
    readonly by: 254;
};
/** Apps publish items from this many days ago (overdue ones whatever their age)... */
export declare const AGENDA_PAST_DAYS = 30;
/** ...to this many days ahead. */
export declare const AGENDA_AHEAD_DAYS = 180;
/** What an app passes in: everything but the bookkeeping the kit fills in. */
export type AgendaInput = Omit<AgendaItem, 'id' | 'app' | 'updatedAt' | 'by'>;
/** An all-day item's `start` (and, for the day after its last, `end`): local midnight of a day. */
export declare const allDayStart: (day: Ymd) => number;
/** The same id for the same item however often it is published: `<app>_<ref>_<start>`, Firestore-safe. */
export declare function agendaId(app: string, ref: string, start: number): string;
/** The stored document: trimmed and clipped to the rules' sizes; throws on what the rules would refuse. */
export declare function agendaDoc(app: string, input: AgendaInput, by: string, now?: number): Omit<AgendaItem, 'id'>;
/** The window apps publish: from `AGENDA_PAST_DAYS` ago to `AGENDA_AHEAD_DAYS` ahead, whole days. */
export declare function agendaWindow(now: number): {
    from: number;
    to: number;
};
/** Whether an item belongs in the published window: overlapping it, or overdue whatever its age. */
export declare function inAgendaWindow(item: Pick<AgendaItem, 'start' | 'end' | 'status'>, now: number): boolean;
export interface AgendaWriteOptions {
    /** The signed-in member's email. */
    by: string;
    /**
     * A helper or kid (`isRestricted(role)`) is writing: only open items are read and written, each on
     * its own, and one the rules refuse (an item from before the flag, until an admin or member's
     * device rewrites it) is skipped rather than failing the rest.
     */
    restricted?: boolean;
    now?: number;
}
export interface AgendaWriteResult {
    written: number;
    deleted: number;
    unchanged: number;
}
/**
 * Makes one source record's items exactly `items` (each gets `ref`): call it when the record is
 * saved. Ids are idempotent, unchanged items are not rewritten, and items this record no longer
 * has (a moved appointment's old time) are deleted. An empty list removes the record's items.
 */
export declare function replaceAgenda(db: Firestore, householdId: string, app: string, ref: string, items: Omit<AgendaInput, 'ref'>[], options: AgendaWriteOptions): Promise<AgendaWriteResult>;
/** Deletes one source record's items (the record was deleted). */
export declare function removeAgenda(db: Firestore, householdId: string, app: string, ref: string, { restricted }?: {
    restricted?: boolean;
}): Promise<number>;
/**
 * Makes everything this app has published exactly `items`: for apps that work out all their dates
 * when they open. Writes only what changed and deletes what is no longer there, so running it on
 * every open costs one read of the app's items and almost no writes.
 */
export declare function syncAgenda(db: Firestore, householdId: string, app: string, items: AgendaInput[], options: AgendaWriteOptions): Promise<AgendaWriteResult>;
/** A stored document as an item, read defensively. */
export declare function toAgendaItem(id: string, data: Record<string, unknown>): AgendaItem;
export interface AgendaRange {
    /** ms; items ending before this are left out, except overdue ones. */
    from: number;
    /** ms; items starting at or after this are left out. */
    to: number;
    /** Only these apps' items. */
    apps?: string[];
    /** A helper or kid (`isRestricted(role)`): only items not marked private, as the rules require. */
    restricted?: boolean;
    onError?: (error: Error) => void;
}
/** Follows the household's items overlapping `from`..`to` (and any overdue), soonest first. */
export declare function watchAgenda(db: Firestore, householdId: string, range: AgendaRange, onChange: (items: AgendaItem[]) => void): Unsubscribe;
/**
 * Where an item stands now. Items with a status become overdue once their time passes even if the
 * app that wrote them hasn't been opened since: an all-day one after its last day, a timed one after
 * its start. Items without a status (appointments, birthdays) have none.
 */
export declare function agendaStatus(item: AgendaItem, now: number): AgendaStatus | undefined;
/** "All day", "3:30 PM", "3:30 PM – 4:30 PM". */
export declare function agendaTime(item: AgendaItem): string;
export type TodayGroup = 'overdue' | 'today' | 'soon' | 'done';
export interface TodayEntry {
    item: AgendaItem;
    group: TodayGroup;
    /** When, in words: "Overdue by 3 days", "Due today", "3:30 PM", "Tomorrow, 9:00 AM". */
    when: string;
}
export interface TodayOptions {
    /** How far ahead "soon" reaches. Default 48. */
    soonHours?: number;
    /** Also return today's finished items, as the 'done' group, so a screen can show what's been done. */
    includeDone?: boolean;
}
/**
 * What needs attention: overdue things first (oldest first), then today's (all-day first, then by
 * time; finished appointments left out), then the next `soonHours`. Done items are left out, and so
 * are feeds and doses from earlier days (`feeding`, `medicine`): those are missed, not overdue.
 * Ongoing spans (all-day, several days, no status: a medicine course, a trip) are context for the
 * calendar, not something to do today, so they are left out too. With `includeDone`, today's
 * finished items come back as the 'done' group, last.
 */
export declare function todayItems(items: AgendaItem[], now: number, { soonHours, includeDone }?: TodayOptions): TodayEntry[];
export interface AgendaDay {
    day: Ymd;
    /** "Today", "Tomorrow", "Yesterday", or "Tuesday, November 4" (with the year when it isn't this year's). */
    label: string;
    /** All-day items first, then by time. */
    items: AgendaItem[];
}
export interface AgendaDaysOptions {
    /** First and last day to show; default every day that has an item. */
    from?: Ymd;
    to?: Ymd;
    /** Include days with nothing on them between `from` and `to`. Default false. */
    emptyDays?: boolean;
}
/** A calendar label for a day relative to now: "Today", "Tomorrow", "Yesterday", or its long date. */
export declare function dayLabel(day: Ymd, now: number): string;
/** Items by local day, for a calendar list: an item spanning several days shows on each of them. */
export declare function agendaDays(items: AgendaItem[], now: number, { from, to, emptyDays }?: AgendaDaysOptions): AgendaDay[];
/** Local midnight today and `days` later: a range for `watchAgenda`. */
export declare function agendaRange(now: number, days: number, pastDays?: number): {
    from: number;
    to: number;
};
