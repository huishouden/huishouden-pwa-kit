import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type Role } from './roles.js';
import { type Op } from './store.js';
/**
 * The household's to-do list: every app's open, actionable things in one collection,
 * `households/{id}/todos`, so the portal can show one list (sorted by when each was added, to clear
 * out old ones) and tick them off or cancel them without knowing any app's data.
 *
 * Each app publishes its open items with `syncTodos` (replace-by-app, as `syncAgenda`), each with
 * declarative `done` and `cancel` actions: lists of `./store` ops on the app's own collections.
 * The portal applies one with `applyTodo`, which writes those ops as the signed-in member, so the
 * source app's record changes and its rules still decide who may. The app then stops publishing
 * the item (it is done or cancelled), and Undo writes the records and the item back.
 *
 * Op data may hold placeholders, resolved when the action runs rather than when it was published:
 * `'$now'` (ms), `'$today'` (YYYY-MM-DD), `'$me'` (the member's email) and `'$today+3m'` (a day
 * that far from today: `d`, `w`, `m` or `y`), so "done" on a job means done today even if the item
 * was published last week.
 *
 * Admins and members read every item; helpers and kids those with `private: false`. Spending's
 * and Bills' are always private. Fields match the rules (`TODO_FIELDS`); keep them in step.
 */
/** `open`: something to do or cancel. `info`: a summary line with no actions ("Groceries: 6 on the list"). */
export type TodoStatus = 'open' | 'info';
export declare const TODO_STATUSES: readonly TodoStatus[];
/** One way to close an item: "Done", "Mark paid", "Skip", "Pause". */
export interface TodoAction {
    /** The button's word, short: "Done", "Mark paid", "Skip". */
    label: string;
    /** Writes under `households/{id}`: `col` is the app's Firestore collection. */
    ops: Op[];
    /** Roles that may (the same the app's rules allow). */
    roles: Role[];
    /** Also whoever added the record (`TodoItem.owner`): helpers and kids change their own things. */
    owner?: boolean;
    /** Also these members (a medicine course's approved helpers). */
    emails?: string[];
}
export interface TodoItem {
    /** `<app>:<ref>`, Firestore-safe (`todoId`). */
    id: string;
    /** The app's repo short name ("home"). */
    app: string;
    /** The source record within the app ("item:abc", "job:xyz"). */
    ref: string;
    title: string;
    /** One short line: the list it is on, an amount, a pet's name. */
    detail?: string;
    /** When the record was added (ms): the list sorts and filters on it. */
    createdAt: number;
    /** When it is due (ms; read by its local day). */
    due?: number;
    /** Who or what it is for: a pet, a person, a car. */
    who?: string;
    /** https deep link to the record in its app. */
    url: string;
    status: TodoStatus;
    /** Only admins and members see it. Stored as a boolean. */
    private?: boolean;
    /** Lowercase email of whoever added the record, for actions open to their owner. */
    owner?: string;
    done?: TodoAction;
    cancel?: TodoAction;
    updatedAt: number;
    /** Lowercase email of the member whose app wrote it. */
    by: string;
}
export declare const TODO_FIELDS: readonly ["app", "ref", "title", "detail", "createdAt", "due", "who", "url", "status", "private", "owner", "done", "cancel", "updatedAt", "by"];
export declare const TODO_ACTION_FIELDS: readonly ["label", "ops", "roles", "owner", "emails"];
/** Maximum lengths and counts, the same as the rules. */
export declare const TODO_LIMITS: {
    readonly app: 40;
    readonly ref: 200;
    readonly title: 120;
    readonly detail: 200;
    readonly url: 2000;
    readonly who: 60;
    readonly by: 254;
    readonly label: 24;
    readonly ops: 8;
    readonly emails: 12;
};
/**
 * The collections each app's actions may write: the portal refuses an action touching anything
 * else (so an item can't be made to change money or settings when someone taps Done). An app that
 * publishes to-dos is listed here; one with an empty list publishes summary lines only.
 */
export declare const TODO_COLLECTIONS: Record<string, readonly string[]>;
/** What an app passes in: everything but the bookkeeping the kit fills in. */
export type TodoInput = Omit<TodoItem, 'id' | 'app' | 'updatedAt' | 'by' | 'status'> & {
    status?: TodoStatus;
};
/** The same id for the same record however often it is published: `<app>:<ref>`, Firestore-safe. */
export declare function todoId(app: string, ref: string): string;
/** Whether every op of an action writes only collections `app` may (`TODO_COLLECTIONS`), and at most `TODO_LIMITS.ops`. */
export declare function todoOpsAllowed(app: string, ops: readonly Op[]): boolean;
/** The stored document: trimmed and clipped to the rules' sizes; throws on what the rules or the portal would refuse. */
export declare function todoDoc(app: string, input: TodoInput, by: string, now?: number): Omit<TodoItem, 'id'>;
/** A stored document as an item, read defensively. */
export declare function toTodoItem(id: string, data: Record<string, unknown>): TodoItem;
export interface TodoWriteOptions {
    /** The signed-in member's email. */
    by: string;
    /** A helper or kid (`isRestricted(role)`): only open items are read and written, each on its own; one the rules refuse is skipped. */
    restricted?: boolean;
    now?: number;
}
export interface TodoWriteResult {
    written: number;
    deleted: number;
    unchanged: number;
}
/**
 * Makes everything this app has published exactly `items`: call it on open and a few seconds after
 * a change (as `syncAgenda`). Writes only what changed and deletes what is no longer open, so a
 * record done or cancelled anywhere leaves the list on the next sync.
 */
export declare function syncTodos(db: Firestore, householdId: string, app: string, items: TodoInput[], { by, restricted, now }: TodoWriteOptions): Promise<TodoWriteResult>;
export interface TodoWatchOptions {
    /** A helper or kid (`isRestricted(role)`): only items not marked private, as the rules require. */
    restricted?: boolean;
    onError?: (error: Error) => void;
}
/** Follows the household's to-dos, newest first. */
export declare function watchTodos(db: Firestore, householdId: string, { restricted, onError }: TodoWatchOptions, onChange: (items: TodoItem[]) => void): Unsubscribe;
export type TodoSort = 'newest' | 'oldest' | 'due' | 'app';
/**
 * `newest` / `oldest`: by when added. `due`: soonest due first, undated last (newest first among
 * them). `app`: by `appOrder` (the portal's tile order; unknown apps after, by name), newest first
 * within an app. Summary lines (`info`) always come last.
 */
export declare function sortTodos(items: readonly TodoItem[], sort: TodoSort, appOrder?: readonly string[]): TodoItem[];
/** Whether an item was added more than `days` days before `now` (default 30): the "Older than 30 days" filter. */
export declare function olderThan(item: Pick<TodoItem, 'createdAt' | 'status'>, now: number, days?: number): boolean;
/** "Overdue by 5 days", "Due today", "Due in 3 weeks", or undefined when it has no due date. */
export declare function todoDueText(item: Pick<TodoItem, 'due'>, now: number): string | undefined;
/** Whether its due day has passed. */
export declare function todoOverdue(item: Pick<TodoItem, 'due' | 'status'>, now: number): boolean;
/** "Added today", "Added yesterday", "Added 3 days ago", "Added 5 weeks ago", "Added Mar 2, 2031". */
export declare function addedText(item: Pick<TodoItem, 'createdAt'>, now: number): string;
/** Whether `me` with `role` may run the item's `done` or `cancel`: the action exists, is allowed for the app, and names their role, them as owner, or them. */
export declare function canDo(item: TodoItem, which: 'done' | 'cancel', role: Role | null | undefined, me: string | null | undefined): boolean;
export interface ResolveContext {
    now: number;
    me: string;
}
/** The ops with their placeholders (`'$now'`, `'$today'`, `'$today+3m'`, `'$me'`) filled in. */
export declare function resolveOps(ops: readonly Op[], ctx: ResolveContext): Op[];
export interface ApplyOptions {
    me: string;
    now?: number;
}
export interface Applied {
    /** Resolves once the server has the write (pending while offline; the screen updates at once). */
    written: Promise<void>;
    /** Writes the records and the item back as they were. */
    undo: () => Promise<void>;
}
/** Thrown when an action can't run: its record is gone or it writes where it shouldn't. */
export declare class TodoActionError extends Error {
}
/**
 * Runs an item's `done` or `cancel`: reads the records it touches (for Undo), then writes its ops
 * and removes the item in one batch as `me`. The rules check every write as if made in the app.
 * A merge onto a record that no longer exists is refused (it was deleted in its app): the item is
 * left for the app to clear on its next sync.
 */
export declare function applyTodo(db: Firestore, householdId: string, item: TodoItem, which: 'done' | 'cancel', { me, now }: ApplyOptions): Promise<Applied>;
