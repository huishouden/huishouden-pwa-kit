import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type PersonalTodoInput, type TodoInput, type TodoItem } from './todo-core.js';
import { type PublishedStorage } from './published.js';
/**
 * The household's to-do list over the Firebase SDK: publishing (`syncTodos`), following
 * (`watchTodos`) and applying an action (`applyTodo`). The list's data contract, reading helpers and
 * the database-free planning of an action are in `./todo-core` (re-exported here), which servers
 * import without Firebase.
 */
export * from './todo-core.js';
export interface TodoWriteOptions {
    /** The signed-in member's email. */
    by: string;
    /** A helper or kid (`isRestricted(role)`): only open items are read and written, each on its own; one the rules refuse is skipped. */
    restricted?: boolean;
    now?: number;
    /** Where this device notes what it published (`./published`): `localStorage` by default, null for none. */
    published?: PublishedStorage | null;
}
export interface TodoWriteResult {
    written: number;
    deleted: number;
    unchanged: number;
    /** Nothing read or written: this device published exactly these items a short while ago (`./published`). */
    skipped?: true;
}
/**
 * Makes everything this app has published exactly `items`: call it on open and a few seconds after
 * a change (as `syncAgenda`). Writes only what changed and deletes what is no longer open, so a
 * record done or cancelled anywhere leaves the list on the next sync.
 */
export declare function syncTodos(db: Firestore, householdId: string, app: string, items: TodoInput[], { by, restricted, now, published }: TodoWriteOptions): Promise<TodoWriteResult>;
/**
 * Makes this app's to-dos for named members exactly `items`, as `syncTodos` does for the shared
 * list: the items whose audience includes `by` (the only ones this member may read or write).
 * Items whose audience leaves `by` out are skipped; another allowed member's device keeps them.
 */
export declare function syncPersonalTodos(db: Firestore, householdId: string, app: string, items: PersonalTodoInput[], { by, now, published }: Omit<TodoWriteOptions, 'restricted'>): Promise<TodoWriteResult>;
export interface TodoWatchOptions {
    /** A helper or kid (`isRestricted(role)`): only items not marked private, as the rules require. */
    restricted?: boolean;
    /** The signed-in member's email: also follows the to-dos for named members that name them (`./audience`). */
    me?: string;
    onError?: (error: Error) => void;
}
/** Follows the household's to-dos (with `me`, the member's personal ones too), newest first. Waits for both lists before the first answer. */
export declare function watchTodos(db: Firestore, householdId: string, { restricted, me, onError }: TodoWatchOptions, onChange: (items: TodoItem[]) => void): Unsubscribe;
export interface ApplyOptions {
    me: string;
    now?: number;
    /** Where this device notes what apps published (`./published`): `localStorage` by default, null for none. */
    published?: PublishedStorage | null;
}
export interface Applied {
    /** Resolves once the server has the write (pending while offline; the screen updates at once). */
    written: Promise<void>;
    /** Writes the records and the item back as they were. */
    undo: () => Promise<void>;
}
/**
 * Runs an item's `done` or `cancel`: reads the records it touches (for Undo), then writes its ops
 * and removes the item in one batch as `me`. The rules check every write as if made in the app.
 * A merge onto a record that no longer exists is refused (it was deleted in its app): the item is
 * left for the app to clear on its next sync.
 */
export declare function applyTodo(db: Firestore, householdId: string, item: TodoItem, which: 'done' | 'cancel', { me, now, published }: ApplyOptions): Promise<Applied>;
