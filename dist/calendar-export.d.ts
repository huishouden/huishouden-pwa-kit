import { type AgendaItem, type AgendaKind, type AgendaSeries, type AgendaStatus } from './agenda-core.js';
import type { TodoItem } from './todo-core.js';
import { type Role } from './role-core.js';
import { type Lang } from './i18n.js';
import { type EventRule } from './schedule.js';
import { type Hhmm, type Ymd } from './time.js';
import { type IcsEvent } from './ics.js';
/**
 * The household's agenda in a person's own calendar: what one person may see, in their language,
 * as calendar events. One model feeds the subscribed calendar (`exportIcs`, served by
 * huishouden/calendar), the Google Calendar sync (the same Worker) and the "Add to calendar"
 * buttons (`addToCalendarIcs`, `googleTemplateUrl`). Server-safe.
 *
 * Who sees what follows the household's rules, and is checked here again: helpers and kids only
 * items not marked private and nothing about money; personal items (Health) only their audience.
 * Each person's settings (`CalendarSettings`) then leave out apps, to-dos or bills, and keep Health
 * items to "Medicine for Ana" unless they ask for the detail, since calendars are often shared.
 *
 * Regular events (an agenda item with `series`) become one repeating event: an RRULE from the
 * schedule, EXDATEs for skipped days and overrides for moved ones.
 */
export interface CalendarSettings {
    /** Apps left out of the calendar ("pet"). */
    hiddenApps: string[];
    /** To-dos with a due day. */
    todos: boolean;
    /** Bills and other money items (admins and members only see them at all). */
    bills: boolean;
    /** Health items with their detail; off, they read "Medicine for Ana" and nothing more. */
    healthDetail: boolean;
    /** Things already done (a ticked task, a given dose). */
    done: boolean;
}
export declare const CALENDAR_SETTINGS = "calendarSettings";
export declare const CALENDAR_SETTINGS_FIELDS: readonly ["hiddenApps", "todos", "bills", "healthDetail", "done", "updatedAt", "by"];
export declare const DEFAULT_CALENDAR_SETTINGS: Readonly<CalendarSettings>;
/** Stored settings read defensively; anything missing takes its default. */
export declare function toCalendarSettings(data: unknown): CalendarSettings;
/** The stored document for settings, as the rules accept it. */
export declare function calendarSettingsDoc(settings: CalendarSettings, by: string, now?: number): {
    updatedAt: number;
    by: string;
    /** Apps left out of the calendar ("pet"). */
    hiddenApps: string[];
    /** To-dos with a due day. */
    todos: boolean;
    /** Bills and other money items (admins and members only see them at all). */
    bills: boolean;
    /** Health items with their detail; off, they read "Medicine for Ana" and nothing more. */
    healthDetail: boolean;
    /** Things already done (a ticked task, a given dose). */
    done: boolean;
};
/**
 * The private extended property every event Huishouden writes to a Google calendar carries:
 * `'<household>:<key>'`. The calendar import (`./calendar`) skips events that have it, so nothing
 * exported comes back as a suggestion.
 */
export declare const EXPORT_PROPERTY = "huishouden";
export declare const exportMark: (householdId: string, key: string) => string;
/**
 * Whether a calendar event came from Huishouden's export: written by the Google sync (its private
 * `huishouden` property) or read from the subscribed feed (an iCalendar UID ending "@huishouden").
 */
export declare function isExportedEvent(e: {
    extendedProperties?: {
        private?: Record<string, string>;
    };
    iCalUID?: string;
} | null | undefined): boolean;
export interface ExportInput {
    /** The shared agenda items and personal items the person can read. */
    agenda: readonly AgendaItem[];
    /** To-dos the person can read; only open ones with a due day are used. */
    todos?: readonly TodoItem[];
    /** Lowercase email. */
    me: string;
    role: Role;
    lang: Lang;
    /** IANA zone the calendar is in. */
    timeZone: string;
    settings: CalendarSettings;
    /**
     * The household's home address (`households/{id}.home.address`): the LOCATION of things that
     * happen at home (`AT_HOME_APPS`: a lawn visit, the plumber, garbage day), so a calendar can map
     * them and a sitter knows where.
     */
    home?: string;
}
/** Apps whose agenda items happen at the household's home. */
export declare const AT_HOME_APPS: readonly string[];
export interface ExportSeries {
    rule: EventRule;
    time?: Hhmm;
    minutes: number;
    /** DTSTART's day: the rule's first occurrence. */
    first: Ymd;
    /** Days the schedule puts an occurrence on that won't happen. */
    exdates: Ymd[];
    /** Moved occurrences, each with `original`. */
    overrides: ExportEvent[];
}
export interface ExportEvent {
    /** The same for the same thing in every run: `app|ref`, or `app|ref|start` when a record has several items; `todo|app|ref` for a to-do. */
    key: string;
    app: string;
    ref: string;
    kind: AgendaKind | 'todo';
    title: string;
    description: string;
    url: string;
    /** Where it happens: the home's address for things at home. */
    location?: string;
    allDay: boolean;
    /** All day: the first day and the day after the last. */
    startDate?: Ymd;
    endDate?: Ymd;
    /** Absolute; all-day events start at midnight in the calendar's zone. */
    start: number;
    end: number;
    status?: AgendaStatus;
    /** A reminder this many minutes before (0: at the start), for things to do by a time. */
    alarmMinutes?: number;
    updatedAt: number;
    series?: ExportSeries;
    /** On an override: the day the schedule put it on. */
    original?: Ymd;
    /** The agenda items it stands for (several for a series), or the to-do. */
    items: AgendaItem[];
    todo?: TodoItem;
    /** Changes whenever anything a calendar shows changes. */
    hash: string;
}
/** A short, stable, non-cryptographic hash (cyrb53) as hex, for noticing changes. */
export declare function contentHash(text: string): string;
/** Whether the person may and wants to see the item: the rules' view again, then their settings. */
export declare function visibleTo(item: Pick<AgendaItem, 'app' | 'kind' | 'private' | 'audience' | 'status'>, { me, role, settings }: Pick<ExportInput, 'me' | 'role' | 'settings'>): boolean;
/**
 * Everything the person's calendar shows, in their language, soonest first. Call `loadExportLang`
 * once first on a server (the words come from the kit's catalogues).
 */
export declare function exportEvents(input: ExportInput): ExportEvent[];
/** Loads the words the export uses in `lang` (on a server, before `exportEvents`). */
export declare const loadExportLang: (lang: Lang) => Promise<void>;
/** The UID of an event in a household's feed: stable for its key. */
export declare const exportUid: (householdId: string, key: string) => string;
/** The RRULE and EXDATE values for a series, in the calendar's zone (shared by the feed and Google). */
export declare function seriesRecurrence(series: ExportSeries, timeZone: string): {
    rrule: string;
    exdates: (Ymd | number)[];
};
/** The original occurrence an override replaces (RECURRENCE-ID): its day, or its usual start. */
export declare const recurrenceIdOf: (series: ExportSeries, original: Ymd, timeZone: string) => Ymd | number;
/** The VEVENTs for export events: one per event, plus one per moved occurrence of a series. */
export declare function toIcsEvents(events: readonly ExportEvent[], { householdId, timeZone, lang }: {
    householdId: string;
    timeZone: string;
    lang?: Lang;
}): IcsEvent[];
export interface ExportIcsOptions {
    householdId: string;
    timeZone: string;
    lang: Lang;
    now: number;
    /** The calendar's name; default "Huishouden". */
    name?: string;
}
/** The person's whole calendar as iCalendar text: their subscribed feed. */
export declare function exportIcs(events: readonly ExportEvent[], { householdId, timeZone, lang, now, name }: ExportIcsOptions): string;
/** One thing to put in a calendar: an agenda entry as an app builds it. */
export interface CalendarEntry {
    title: string;
    start: number;
    end?: number;
    allDay: boolean;
    detail?: string;
    /** Where: an address or place name. */
    location?: string;
    /** Deep link back to the record. */
    url?: string;
    kind?: AgendaKind;
    /** For something on a schedule: the whole series goes in, repeating. */
    series?: Pick<AgendaSeries, 'rule' | 'time' | 'minutes'>;
}
/** A one-event .ics file (METHOD:PUBLISH) for Apple Calendar, Outlook and others; a series repeats. */
export declare function addToCalendarIcs(entry: CalendarEntry, { timeZone, now, uid }?: {
    timeZone?: string;
    now?: number;
    uid?: string;
}): string;
/**
 * Google Calendar's "add this event" page for the entry (`calendar.google.com/calendar/render?action=TEMPLATE`):
 * dates in the entry's zone, the series' RRULE as `recur`, the detail and link as its notes.
 */
export declare function googleTemplateUrl(entry: CalendarEntry, { timeZone }?: {
    timeZone?: string;
}): string;
