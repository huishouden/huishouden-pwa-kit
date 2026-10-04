import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type AgendaInput, type AgendaItem, type AgendaRange, type PersonalAgendaInput } from './agenda-core.js';
/**
 * The household's agenda over the Firebase SDK: publishing (`syncAgenda` and friends) and following
 * (`watchAgenda`). The data contract and every reading helper are in `./agenda-core` (re-exported
 * here), which servers import without Firebase.
 */
export * from './agenda-core.js';
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
/**
 * Makes this app's items for named members exactly `items`, as `syncAgenda` does for the shared
 * agenda: the items whose audience includes `by` (the only ones this member may read or write).
 * Items whose audience leaves `by` out are skipped; another allowed member's device keeps them.
 */
export declare function syncPersonalAgenda(db: Firestore, householdId: string, app: string, items: PersonalAgendaInput[], { by, now }: Omit<AgendaWriteOptions, 'restricted'>): Promise<AgendaWriteResult>;
/**
 * Follows the household's items overlapping `from`..`to` (and any overdue), soonest first; with
 * `me`, the member's personal items too. Waits for both lists before the first answer.
 */
export declare function watchAgenda(db: Firestore, householdId: string, range: AgendaRange, onChange: (items: AgendaItem[]) => void): Unsubscribe;
