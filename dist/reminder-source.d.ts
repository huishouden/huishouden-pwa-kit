import type { Role } from './role-core.js';
/**
 * What a reminder is about, so the shared sender (huishouden/notify) can tell it is no longer due
 * when the thing was done somewhere other than the app that wrote it: a bill paid from the portal's
 * To-do list or the connector, a task ticked in Google Tasks, a dose marked on another phone.
 * Before sending, the sender reads the records a reminder's `source` names and deletes the
 * reminder unsent when they say it is done. Without a source, a reminder is sent as before.
 *
 * A source is a list of `checks`, each on one document under the household:
 * - `{ doc, due }`: passes while the document exists and every condition holds. Without conditions,
 *   while it exists (a course not removed).
 * - `{ doc, absent: true }`: passes while the document doesn't exist: a record written once the
 *   thing is done (a dose marked given, a thing to do before an event ticked).
 *
 * The reminder is due while every check passes, or with `any: true` while at least one does (a
 * reminder for several doses at once, due while any is unmarked).
 *
 * The sender reads with its own service account, so what a source may name is limited here, and
 * the sender refuses anything else: only the reminder's own app's collections and, in each, only
 * the fields that say whether a record is done (`REMINDER_SOURCES`); only from writers who may read
 * those records (`roles`, and a Health person's `readers`); the rules make `by` the writer. A
 * refused source counts as none. So a source never tells its writer anything they couldn't see.
 *
 * Server-safe: no Firebase, no DOM. The sender imports it as it is.
 */
/** A value a condition compares a field with. */
export type SourceValue = string | number | boolean | null;
/** One condition on a field (a missing field reads as null): its value is one of `in`, or none of `notIn`. */
export type SourceCondition = {
    field: string;
    in: SourceValue[];
} | {
    field: string;
    notIn: SourceValue[];
};
/** One document under the household and when it keeps the reminder due. */
export type SourceCheck = {
    doc: string;
    due?: SourceCondition[];
} | {
    doc: string;
    absent: true;
};
export interface ReminderSource {
    checks: SourceCheck[];
    /** Due while any check passes, rather than all. */
    any?: boolean;
}
/** The sizes the sender and the rules accept. */
export declare const REMINDER_SOURCE_LIMITS: {
    readonly checks: 8;
    readonly conditions: 4;
    readonly values: 8;
    readonly path: 400;
    readonly value: 200;
};
/** What a collection lets a source check, and who may. */
export interface SourceCollection {
    /** Fields conditions may read: the ones that say whether a record is done. */
    fields: readonly string[];
    /** Writers' roles whose sources may name it. */
    roles: readonly Role[];
    /** The record's person (`healthPeople/{id}`, the first two parts) must list the writer in `readers`, unless an admin. */
    readers?: boolean;
}
/**
 * By app, the collections its reminders' sources may name (`*` is one document id) and what each
 * allows. Kids' reminders never carry a source the sender uses. Add an app's collections here
 * before its reminders name them.
 */
export declare const REMINDER_SOURCES: Record<string, Record<string, SourceCollection>>;
/** The collection entry a document path falls in for `app`, or undefined when its sources may not name it. */
export declare function sourceCollection(app: string, doc: string): SourceCollection | undefined;
/**
 * A stored or written `source` as the sender uses it, or null when there is none or it breaks any
 * limit: another app's collection, a field that isn't a done field, too many checks.
 */
export declare function readSource(app: string, value: unknown): ReminderSource | null;
/**
 * `source` as `reminderDoc` writes it, or undefined for none. One the sender would refuse is left
 * off with a console warning, so the reminder still goes out (as one without a source) rather than
 * failing the app's whole sync.
 */
export declare function cleanSource(app: string, source: ReminderSource | undefined | null): ReminderSource | undefined;
/** Every document the sender reads for a source: its checks' and, for Health records, their people's. */
export declare function sourceReads(app: string, source: ReminderSource): string[];
/** Documents as read: fields, or null when the document doesn't exist. A path not in the map wasn't read. */
export type SourceDocs = Map<string, Record<string, unknown> | null>;
/**
 * Whether a writer with this role may have their source checked: every collection allows the role
 * and, for Health records, the writer is an admin or one of the person's `readers`. Undefined while a
 * person document it needs wasn't read.
 */
export declare function sourceAllowed(app: string, source: ReminderSource, writer: string, role: string, read: SourceDocs): boolean | undefined;
/**
 * Whether the reminder is still due by its documents as read. Undefined when a document it needs
 * wasn't read and the ones that were don't settle it: the sender then sends it as before.
 */
export declare function stillDue(source: ReminderSource, read: SourceDocs): boolean | undefined;
