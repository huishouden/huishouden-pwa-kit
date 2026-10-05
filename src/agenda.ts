import { collection, doc, getDocs, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { writeBatch } from './firestore.js';
import { cleanAudience, inAudience } from './audience.js';
import { agendaDoc, agendaId, agendaInRange, inAgendaWindow, personalAgendaDoc, toAgendaItem, PERSONAL_AGENDA, type AgendaInput, type AgendaItem, type AgendaRange, type PersonalAgendaInput } from './agenda-core.js';
import { alreadyPublished, fingerprint, forgetPublishedApp, publishedKey, rememberPublished } from './published.js';

/**
 * The household's agenda over the Firebase SDK: publishing (`syncAgenda` and friends) and following
 * (`watchAgenda`). The data contract and every reading helper are in `./agenda-core` (re-exported
 * here), which servers import without Firebase.
 */
export * from './agenda-core.js';

const agendaOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, 'agenda');
const personalOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, PERSONAL_AGENDA);


const comparable = ({ updatedAt: _u, by: _b, ...rest }: Omit<AgendaItem, 'id'> & { id?: string }) => {
  delete rest.id;
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k as keyof typeof rest]]));
};

type Op = (b: ReturnType<typeof writeBatch>) => void;

const refused = (e: unknown) => (e as { code?: string })?.code === 'permission-denied';

async function commit(db: Firestore, ops: Op[], restricted = false): Promise<void> {
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
  /** Nothing read or written: this device published exactly these items a short while ago (`./published`). */
  skipped?: true;
}

/** The documents `items` stand for: those in the publishing window (and, for a helper or kid, not private), by id. */
function wantedOf<I extends AgendaInput>(app: string, items: I[], restricted: boolean, now: number, build: (item: I) => Omit<AgendaItem, 'id'>): Map<string, Omit<AgendaItem, 'id'>> {
  const wanted = new Map<string, Omit<AgendaItem, 'id'>>();
  for (const item of items) {
    if (!inAgendaWindow(item, now)) continue;
    // A helper's device can't see private items, so it never publishes or removes them.
    if (restricted && item.private) continue;
    wanted.set(agendaId(app, item.ref, item.start), build(item));
  }
  return wanted;
}

/** Makes `stored` (this app's items, or one ref's) exactly `wanted`, writing only what changed. */
async function reconcile(
  db: Firestore,
  stored: { id: string; data: Record<string, unknown> }[],
  wanted: Map<string, Omit<AgendaItem, 'id'>>,
  restricted: boolean,
  col: ReturnType<typeof agendaOf>,
): Promise<AgendaWriteResult> {
  const ops: Op[] = [];
  let unchanged = 0;
  const have = new Map(stored.map((s) => [s.id, s.data]));
  for (const { id } of stored) if (!wanted.has(id)) ops.push((b) => b.delete(doc(col, id)));
  const deleted = ops.length;
  for (const [id, data] of wanted) {
    const old = have.get(id);
    if (old && comparable(toAgendaItem(id, old)) === comparable({ ...data })) unchanged++;
    else ops.push((b) => b.set(doc(col, id), data));
  }
  await commit(db, ops, restricted);
  return { written: ops.length - deleted, deleted, unchanged };
}

/** The agenda, or for a helper or kid only its open items (what the rules let them read). */
const visible = (db: Firestore, householdId: string, restricted: boolean | undefined, ...filters: ReturnType<typeof where>[]) =>
  query(agendaOf(db, householdId), ...filters, ...(restricted ? [where('private', '==', false)] : []));

const snapshotDocs = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));

/**
 * Makes one source record's items exactly `items` (each gets `ref`): call it when the record is
 * saved. Ids are idempotent, unchanged items are not rewritten, and items this record no longer
 * has (a moved appointment's old time) are deleted. An empty list removes the record's items.
 */
export async function replaceAgenda(
  db: Firestore,
  householdId: string,
  app: string,
  ref: string,
  items: Omit<AgendaInput, 'ref'>[],
  options: AgendaWriteOptions,
): Promise<AgendaWriteResult> {
  const { by, restricted = false, now = Date.now() } = options;
  forgetPublishedApp(db, householdId, 'agenda', app);
  const snap = await getDocs(visible(db, householdId, restricted, where('app', '==', app), where('ref', '==', ref)));
  const wanted = wantedOf(app, items.map((i) => ({ ...i, ref })), restricted, now, (item) => agendaDoc(app, item, by, now));
  return reconcile(db, snapshotDocs(snap), wanted, restricted, agendaOf(db, householdId));
}

/** Deletes one source record's items (the record was deleted). */
export async function removeAgenda(db: Firestore, householdId: string, app: string, ref: string, { restricted = false }: { restricted?: boolean } = {}): Promise<number> {
  forgetPublishedApp(db, householdId, 'agenda', app);
  const snap = await getDocs(visible(db, householdId, restricted, where('app', '==', app), where('ref', '==', ref)));
  await commit(db, snap.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)), restricted);
  return snap.docs.length;
}

/**
 * Makes everything this app has published exactly `items`: for apps that work out all their dates
 * when they open. Writes only what changed and deletes what is no longer there. When this device
 * already published exactly these items in the last few hours (`./published`), it returns without
 * reading (`skipped`); otherwise it costs one read of the app's items and almost no writes.
 */
export async function syncAgenda(db: Firestore, householdId: string, app: string, items: AgendaInput[], options: AgendaWriteOptions): Promise<AgendaWriteResult> {
  const { by, restricted = false, now = Date.now() } = options;
  const wanted = wantedOf(app, items, restricted, now, (item) => agendaDoc(app, item, by, now));
  const key = publishedKey(db, householdId, 'agenda', app, by);
  const print = fingerprint(wanted, String(restricted));
  if (alreadyPublished(key, print, now)) return { written: 0, deleted: 0, unchanged: wanted.size, skipped: true };
  const snap = await getDocs(visible(db, householdId, restricted, where('app', '==', app)));
  const result = await reconcile(db, snapshotDocs(snap), wanted, restricted, agendaOf(db, householdId));
  rememberPublished(key, print, now);
  return result;
}

/**
 * Makes this app's items for named members exactly `items`, as `syncAgenda` does for the shared
 * agenda: the items whose audience includes `by` (the only ones this member may read or write).
 * Items whose audience leaves `by` out are skipped; another allowed member's device keeps them.
 */
export async function syncPersonalAgenda(
  db: Firestore,
  householdId: string,
  app: string,
  items: PersonalAgendaInput[],
  { by, now = Date.now() }: Omit<AgendaWriteOptions, 'restricted'>,
): Promise<AgendaWriteResult> {
  const me = by.trim().toLowerCase();
  const col = personalOf(db, householdId);
  const mine = items.filter((i) => inAudience(cleanAudience(i.audience), me));
  const wanted = wantedOf(app, mine, false, now, (item) => personalAgendaDoc(app, item, me, now));
  const key = publishedKey(db, householdId, PERSONAL_AGENDA, app, me);
  const print = fingerprint(wanted);
  if (alreadyPublished(key, print, now)) return { written: 0, deleted: 0, unchanged: wanted.size, skipped: true };
  const snap = await getDocs(query(col, where('app', '==', app), where('audience', 'array-contains', me)));
  const result = await reconcile(db, snapshotDocs(snap), wanted, false, col);
  rememberPublished(key, print, now);
  return result;
}


/**
 * Follows the household's items overlapping `from`..`to` (and any overdue), soonest first; with
 * `me`, the member's personal items too. Waits for both lists before the first answer.
 */
export function watchAgenda(db: Firestore, householdId: string, range: AgendaRange, onChange: (items: AgendaItem[]) => void): Unsubscribe {
  const { from, to, apps, restricted, me, onError } = range;
  let shared: AgendaItem[] | null = null;
  let personal: AgendaItem[] | null = me ? null : [];
  const emit = () => {
    if (shared && personal) onChange(agendaInRange([...shared, ...personal], { from, to, apps }));
  };
  const unsubs = [
    onSnapshot(
      visible(db, householdId, restricted, where('start', '<', to)),
      (snap) => {
        shared = snap.docs.map((d) => toAgendaItem(d.id, d.data()));
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
          personal = snap.docs.map((d) => toAgendaItem(d.id, d.data()));
          emit();
        },
        // Rules from before personal items refuse the query: the shared agenda still shows.
        () => {
          personal = [];
          emit();
        },
      ),
    );
  }
  return () => unsubs.forEach((u) => u());
}