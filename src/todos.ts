import { collection, doc, getDoc, getDocs, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { commitOps, writeBatch } from './firestore.js';
import { MONEY_APPS } from './role-core.js';
import {
  PERSONAL_TODOS,
  personalTodoDoc,
  planTodo,
  sortTodos,
  todoActionOps,
  todoDoc,
  todoId,
  toTodoItem,
  type PersonalTodoInput,
  type TodoInput,
  type TodoItem,
} from './todo-core.js';
import { cleanAudience, inAudience } from './audience.js';
import { fingerprint, forgetPublished, publishedKey, publishedStore, unlessPublished, type PublishedStorage } from './published.js';

/**
 * The household's to-do list over the Firebase SDK: publishing (`syncTodos`), following
 * (`watchTodos`) and applying an action (`applyTodo`). The list's data contract, reading helpers and
 * the database-free planning of an action are in `./todo-core` (re-exported here), which servers
 * import without Firebase.
 */
export * from './todo-core.js';

const todosOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, 'todos');
const personalOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, PERSONAL_TODOS);

// ---- Publishing ----

const comparable = ({ updatedAt: _u, by: _b, ...rest }: Omit<TodoItem, 'id'> & { id?: string }) => {
  delete rest.id;
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k as keyof typeof rest]]));
};

const refused = (e: unknown) => (e as { code?: string })?.code === 'permission-denied';

type BatchOp = (b: ReturnType<typeof writeBatch>) => void;

async function commit(db: Firestore, ops: BatchOp[], restricted: boolean): Promise<void> {
  if (restricted) {
    for (const op of ops) {
      const batch = writeBatch(db);
      op(batch);
      await batch.commit().catch((e) => {
        if (!refused(e)) throw e;
      });
    }
    return;
  }
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 450)) op(batch);
    await batch.commit();
  }
}

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

/** The to-dos, or for a helper or kid only those not marked private (what the rules let them read). */
const visible = (db: Firestore, householdId: string, restricted: boolean | undefined, ...filters: ReturnType<typeof where>[]) =>
  query(todosOf(db, householdId), ...filters, ...(restricted ? [where('private', '==', false)] : []));

/**
 * Makes everything this app has published exactly `items`: call it on open and a few seconds after
 * a change (as `syncAgenda`). Writes only what changed and deletes what is no longer open, so a
 * record done or cancelled anywhere leaves the list on the next sync.
 */
export async function syncTodos(db: Firestore, householdId: string, app: string, items: TodoInput[], { by, restricted = false, now = Date.now(), published }: TodoWriteOptions): Promise<TodoWriteResult> {
  const wanted = new Map<string, Omit<TodoItem, 'id'>>();
  for (const item of items) {
    // A helper's device can't see private items, so it never publishes or removes them.
    if (restricted && (item.private || MONEY_APPS.includes(app))) continue;
    wanted.set(todoId(app, item.ref), todoDoc(app, item, by, now));
  }
  // The same items this device published a short while ago: nothing to read or write (`./published`).
  return unlessPublished(
    publishedStore(published),
    publishedKey(db, householdId, 'todos', app, by),
    fingerprint(wanted, String(restricted)),
    now,
    () => ({ written: 0, deleted: 0, unchanged: wanted.size, skipped: true }),
    async () => reconcile(db, todosOf(db, householdId), (await getDocs(visible(db, householdId, restricted, where('app', '==', app)))).docs, wanted, restricted),
  );
}

/** Makes the stored documents exactly `wanted`, writing only what changed. */
async function reconcile(
  db: Firestore,
  col: ReturnType<typeof todosOf>,
  stored: { id: string; data: () => unknown }[],
  wanted: Map<string, Omit<TodoItem, 'id'>>,
  restricted: boolean,
): Promise<TodoWriteResult> {
  const ops: BatchOp[] = [];
  let unchanged = 0;
  const have = new Map(stored.map((d) => [d.id, d.data() as Record<string, unknown>]));
  for (const id of have.keys()) if (!wanted.has(id)) ops.push((b) => b.delete(doc(col, id)));
  const deleted = ops.length;
  for (const [id, data] of wanted) {
    const old = have.get(id);
    if (old && comparable(toTodoItem(id, old)) === comparable({ ...data })) unchanged++;
    else ops.push((b) => b.set(doc(col, id), data));
  }
  await commit(db, ops, restricted);
  return { written: ops.length - deleted, deleted, unchanged };
}

/**
 * Makes this app's to-dos for named members exactly `items`, as `syncTodos` does for the shared
 * list: the items whose audience includes `by` (the only ones this member may read or write).
 * Items whose audience leaves `by` out are skipped; another allowed member's device keeps them.
 */
export async function syncPersonalTodos(
  db: Firestore,
  householdId: string,
  app: string,
  items: PersonalTodoInput[],
  { by, now = Date.now(), published }: Omit<TodoWriteOptions, 'restricted'>,
): Promise<TodoWriteResult> {
  const me = by.trim().toLowerCase();
  const col = personalOf(db, householdId);
  const wanted = new Map<string, Omit<TodoItem, 'id'>>();
  for (const item of items) {
    if (!inAudience(cleanAudience(item.audience), me)) continue;
    wanted.set(todoId(app, item.ref), personalTodoDoc(app, item, me, now));
  }
  return unlessPublished(
    publishedStore(published),
    publishedKey(db, householdId, PERSONAL_TODOS, app, me),
    fingerprint(wanted),
    now,
    () => ({ written: 0, deleted: 0, unchanged: wanted.size, skipped: true }),
    async () => reconcile(db, col, (await getDocs(query(col, where('app', '==', app), where('audience', 'array-contains', me)))).docs, wanted, false),
  );
}

export interface TodoWatchOptions {
  /** A helper or kid (`isRestricted(role)`): only items not marked private, as the rules require. */
  restricted?: boolean;
  /** The signed-in member's email: also follows the to-dos for named members that name them (`./audience`). */
  me?: string;
  onError?: (error: Error) => void;
}

/** Follows the household's to-dos (with `me`, the member's personal ones too), newest first. Waits for both lists before the first answer. */
export function watchTodos(db: Firestore, householdId: string, { restricted, me, onError }: TodoWatchOptions, onChange: (items: TodoItem[]) => void): Unsubscribe {
  let shared: TodoItem[] | null = null;
  let personal: TodoItem[] | null = me ? null : [];
  const emit = () => {
    if (shared && personal) onChange(sortTodos([...shared, ...personal], 'newest'));
  };
  const unsubs = [
    onSnapshot(
      visible(db, householdId, restricted),
      (snap) => {
        shared = snap.docs.map((d) => toTodoItem(d.id, d.data()));
        emit();
      },
      (error) => onError?.(error),
    ),
  ];
  if (me) {
    unsubs.push(
      onSnapshot(
        query(personalOf(db, householdId), where('audience', 'array-contains', me.trim().toLowerCase())),
        (snap) => {
          personal = snap.docs.map((d) => toTodoItem(d.id, d.data()));
          emit();
        },
        // Rules from before personal items refuse the query: the shared list still shows.
        () => {
          personal = [];
          emit();
        },
      ),
    );
  }
  return () => unsubs.forEach((u) => u());
}

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
export async function applyTodo(db: Firestore, householdId: string, item: TodoItem, which: 'done' | 'cancel', { me, now = Date.now(), published }: ApplyOptions): Promise<Applied> {
  const ops = todoActionOps(item, which, { now, me });
  const base = `households/${householdId}`;
  const before = new Map<string, { id: string } | undefined>();
  for (const op of ops) {
    const key = `${op.col}/${op.id}`;
    if (before.has(key)) continue;
    const snap = await getDoc(doc(db, base, op.col, op.id));
    before.set(key, snap.exists() ? { id: op.id, ...(snap.data() as object) } : undefined);
  }
  const plan = planTodo(item, ops, (col, id) => before.get(`${col}/${id}`), { now, me });
  // The item leaves the list here, not in its app's sync: that app's next sync on this device reads again.
  for (const list of ['todos', PERSONAL_TODOS]) forgetPublished(publishedStore(published), db, householdId, list, item.app);
  const written = commitOps(db, base, plan.writes);
  return {
    written,
    undo: () => commitOps(db, base, plan.undo(Date.now())),
  };
}
