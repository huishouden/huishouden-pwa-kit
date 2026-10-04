import { type Ymd } from './time.js';
import { type LocalTexts } from './i18n.js';
import { type EventRule } from './schedule.js';
import { type Hhmm } from './time.js';
import { type Role } from './role-core.js';
import type { Op } from './store.js';
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
    /**
     * Only these members see it (lowercase emails): an item in `personalAgenda` (`./audience`), about
     * one person's care. Absent on the shared agenda.
     */
    audience?: string[];
    /** The title and detail in every language (`localizeAgenda`); `title`/`detail` are the writer's and the fallback. */
    texts?: AgendaTexts;
    /**
     * One occurrence of something on a schedule (garbage pickup every Thursday): the schedule, so a
     * calendar can show the whole series as one repeating event (`./calendar-export`), and which of
     * its days this one is.
     */
    series?: AgendaSeries;
    /**
     * How a change made elsewhere (the item moved or renamed in the person's own calendar) is written
     * back to the record it came from: declarative writes on the app's own collections, as a to-do's
     * Done (`./todo-core`), made as the person so the app's rules still decide.
     */
    edit?: AgendaEdit;
    updatedAt: number;
    /** Lowercase email of the member whose app wrote it. */
    by: string;
}
/** What an agenda item says, per language. */
export type AgendaTexts = LocalTexts<'title' | 'detail'>;
export declare const AGENDA_FIELDS: readonly ["app", "ref", "kind", "title", "start", "end", "allDay", "detail", "url", "who", "status", "private", "texts", "series", "edit", "updatedAt", "by"];
/**
 * An occurrence's schedule. Each occurrence of the series carries the same `rule`, `time` and
 * `through`; `original` is the day the schedule put this one on (the key of a move or skip in the
 * app's own record), which differs from the item's day when it was moved. A day of the rule up to
 * `through` with no item is skipped; after `through` nothing is known yet, so the schedule stands.
 */
export interface AgendaSeries {
    rule: EventRule;
    /** Its usual time of day; all day without one. */
    time?: Hhmm;
    /** How long a timed occurrence lasts, in minutes (default `SERIES_DEFAULT_MINUTES`). */
    minutes?: number;
    original: Ymd;
    /** The last day the app published occurrences for. */
    through: Ymd;
}
export declare const SERIES_FIELDS: readonly ["rule", "time", "minutes", "original", "through"];
export declare const SERIES_DEFAULT_MINUTES = 60;
/**
 * Writes that change the source record, each with the roles that may (the same as the app's rules).
 * `reschedule`: the item moved to another day or time. `retime`: a series' usual time changed for
 * every occurrence. `rename`: a new title (for a series, the whole series'). `notes`: new notes.
 * `skip`: this occurrence of a series won't happen. `cancel`: a one-off item was deleted.
 *
 * Op data may use the to-do placeholders (`'$now'`, `'$today'`, `'$me'`) and these, filled in from
 * the change: `'$start'` and `'$end'` (ms), `'$date'` (YYYY-MM-DD) and `'$time'` (HH:MM, or the
 * field is removed when the item became all day), `'$title'` and `'$notes'`, and for an occurrence
 * of a series `'$original'`, its day as the schedule has it, also as a map key, so one edit on the
 * series serves every occurrence: `{ exceptions: { $original: { skipped: true } } }`.
 */
export interface AgendaEdit {
    reschedule?: AgendaAction;
    retime?: AgendaAction;
    rename?: AgendaAction;
    notes?: AgendaAction;
    skip?: AgendaAction;
    cancel?: AgendaAction;
}
export type AgendaEditKind = keyof AgendaEdit;
export declare const AGENDA_EDIT_KINDS: readonly AgendaEditKind[];
export interface AgendaAction {
    /** Writes under `households/{id}`, on collections the app may change (`AGENDA_EDIT_COLLECTIONS`). */
    ops: Op[];
    roles: Role[];
    /** Also these members (lowercase emails): whoever added the record, a medicine's carers. */
    emails?: string[];
}
/** The most writes one action may make, and members it may name. */
export declare const AGENDA_EDIT_LIMITS: {
    readonly ops: 4;
    readonly emails: 12;
};
/**
 * The collections each app's agenda edits may write. A change from a calendar that would touch
 * anything else is refused, so an item can't be made to change money or settings.
 */
export declare const AGENDA_EDIT_COLLECTIONS: Record<string, readonly string[]>;
/** The collection of items for named members only (`./audience`). */
export declare const PERSONAL_AGENDA = "personalAgenda";
/** Fields of a `personalAgenda` item: the agenda's plus `audience`. */
export declare const PERSONAL_AGENDA_FIELDS: readonly ["app", "ref", "kind", "title", "start", "end", "allDay", "detail", "url", "who", "status", "private", "texts", "series", "edit", "updatedAt", "by", "audience"];
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
/** Limits inside `texts`, the same as the fields they translate. */
export declare const AGENDA_TEXT_LIMITS: {
    readonly title: 120;
    readonly detail: 200;
};
/**
 * Runs `build` once per language and gives its items with `texts` (title and detail), so the
 * portal shows each reader their own language:
 *
 * ```ts
 * syncAgenda(db, id, 'bills', await localizeAgenda(() => billAgenda(bills)), { by: me });
 * ```
 */
export declare function localizeAgenda<T extends Pick<AgendaInput, 'title' | 'detail'>>(build: () => T[]): Promise<(T & {
    texts: AgendaTexts;
})[]>;
/** An item's title and detail in the reader's language. */
export declare function agendaWords(item: Pick<AgendaItem, 'title' | 'detail' | 'texts'>): {
    title: string;
    detail?: string;
};
/** Apps publish items from this many days ago (overdue ones whatever their age)... */
export declare const AGENDA_PAST_DAYS = 30;
/** ...to this many days ahead. */
export declare const AGENDA_AHEAD_DAYS = 180;
/** What an app passes in: everything but the bookkeeping the kit fills in. */
export type AgendaInput = Omit<AgendaItem, 'id' | 'app' | 'updatedAt' | 'by' | 'audience'>;
/** An item for named members only: who may see it (`./audience`). */
export type PersonalAgendaInput = AgendaInput & {
    audience: readonly string[];
};
/** An all-day item's `start` (and, for the day after its last, `end`): local midnight of a day. */
export declare const allDayStart: (day: Ymd) => number;
/** The same id for the same item however often it is published: `<app>_<ref>_<start>`, Firestore-safe. */
export declare function agendaId(app: string, ref: string, start: number): string;
/** The stored document: trimmed and clipped to the rules' sizes; throws on what the rules would refuse. */
export declare function agendaDoc(app: string, input: AgendaInput, by: string, now?: number): Omit<AgendaItem, 'id'>;
/**
 * A `personalAgenda` document: as `agendaDoc`, private, with the audience cleaned. Throws when the
 * audience is empty or leaves out the writer (the rules refuse both).
 */
export declare function personalAgendaDoc(app: string, input: PersonalAgendaInput, by: string, now?: number): Omit<AgendaItem, 'id'>;
/** The window apps publish: from `AGENDA_PAST_DAYS` ago to `AGENDA_AHEAD_DAYS` ahead, whole days. */
export declare function agendaWindow(now: number): {
    from: number;
    to: number;
};
/** Whether an item belongs in the published window: overlapping it, or overdue whatever its age. */
export declare function inAgendaWindow(item: Pick<AgendaItem, 'start' | 'end' | 'status'>, now: number): boolean;
/** A series as stored: known keys only, or undefined when it isn't one. */
export declare function cleanSeries(v: unknown): AgendaSeries | undefined;
/** Whether every op writes only collections `app`'s edits may (`AGENDA_EDIT_COLLECTIONS`), and at most `AGENDA_EDIT_LIMITS.ops`. */
export declare function agendaOpsAllowed(app: string, ops: readonly Op[]): boolean;
/** An item's edits as stored; throws on one that writes outside the app's collections (`AGENDA_EDIT_COLLECTIONS`). */
export declare function cleanEdit(app: string, edit: AgendaEdit): AgendaEdit | undefined;
/** Whether `me` with `role` may make the item's `kind` edit: it exists, is allowed for the app, and names their role or them. */
export declare function canEdit(item: Pick<AgendaItem, 'app' | 'edit'>, kind: AgendaEditKind, role: Role | null | undefined, me: string | null | undefined): boolean;
/** What fills an edit's placeholders: the change as the calendar has it. */
export interface EditValues {
    start?: number;
    end?: number;
    /** YYYY-MM-DD, the item's day where it happens. */
    date?: Ymd;
    /** HH:MM, or null when it became all day (the field is removed). */
    time?: Hhmm | null;
    title?: string;
    notes?: string;
    /** YYYY-MM-DD: the day the schedule put the occurrence on, for `'$original'` (a value, or a map key). */
    original?: Ymd;
}
/** Sentinel the writer turns into a field delete (Firestore REST: the field left out of a merge's values). */
export declare const DELETE_FIELD = "$delete";
/**
 * An edit's ops with the change's values in place of `'$start'`, `'$date'`, `'$time'`, `'$title'`
 * and so on (the to-do placeholders such as `'$now'` are left for `resolveOps`). Throws when the
 * change lacks a value an op needs. `'$time'` for an item that became all day is `DELETE_FIELD`.
 */
export declare function fillEditOps(ops: readonly Op[], values: EditValues): Op[];
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
    /** The signed-in member's email: also follows the items for named members that name them (`./audience`). */
    me?: string;
    onError?: (error: Error) => void;
}
/**
 * The items overlapping `from`..`to` (and any overdue), soonest first, optionally only `apps`':
 * what `watchAgenda` shows, for a reader of stored items without Firebase.
 */
export declare function agendaInRange(items: readonly AgendaItem[], { from, to, apps }: Pick<AgendaRange, 'from' | 'to' | 'apps'>): AgendaItem[];
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
 * are feeds and doses from earlier days (`feeding`, `medicine`) and timed items with a status whose
 * `end` has passed (a window to do it in that has closed): those are missed, not overdue.
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
