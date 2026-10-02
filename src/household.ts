import { collection, doc, getDocs, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { addDoc, arrayRemove, arrayUnion, setDoc, updateDoc } from './firestore.js';
import { observeHousehold } from './observability.js';

/**
 * A household shared by every app in the family: one document per household in
 * `households/{householdId}`, with members identified by lowercase email. Apps keep their own data
 * in subcollections (`households/{id}/lists`, `/spendingTransactions`, ...), and security rules grant
 * access to members of the parent document — so adding someone here gives them every app at once.
 *
 * Shape matches the rules every app shares:
 *   { name: string, members: string[], joined?: string[], createdAt: number }
 */
export interface Household {
  id: string;
  name: string;
  /** Lowercase emails allowed in. Invited people are members before they first sign in. */
  members: string[];
  /** Members who have signed in at least once (each member records their own). */
  joined: string[];
  createdAt: number;
}

export type HouseholdState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; household: Household }
  | { status: 'error'; error: Error };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const COLLECTION = 'households';

/**
 * The household an app uses when a person belongs to several: the oldest, so every app picks the
 * same one. Documents still waiting for the server (a household created a moment ago on this device)
 * are skipped — the rules can't see them yet, so subscriptions under them would be refused.
 */
export function pickHousehold(docs: { id: string; data: Record<string, unknown>; pending?: boolean }[]): Household | null {
  const households = docs
    .filter((d) => !d.pending)
    .map((d) => toHousehold(d.id, d.data))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return households[0] ?? null;
}

const membersQuery = (db: Firestore, email: string) =>
  query(collection(db, COLLECTION), where('members', 'array-contains', normalizeEmail(email)));

/** Follows the household the signed-in person belongs to (see `pickHousehold`). */
export function watchHousehold(db: Firestore, email: string, onChange: (state: HouseholdState) => void): Unsubscribe {
  onChange({ status: 'loading' });
  return onSnapshot(
    membersQuery(db, email),
    { includeMetadataChanges: true },
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites }));
      // Stay loading while the only household is a local one the server hasn't accepted yet.
      if (docs.length && docs.every((d) => d.pending)) return;
      const household = pickHousehold(docs);
      onChange(household ? { status: 'ready', household } : { status: 'none' });
    },
    (error) => onChange({ status: 'error', error }),
  );
}

/** One-off lookup of the same household `watchHousehold` follows; null when not a member anywhere. */
export async function findHousehold(db: Firestore, email: string): Promise<Household | null> {
  const snap = await getDocs(membersQuery(db, email));
  return pickHousehold(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
}

export function toHousehold(id: string, data: Record<string, unknown>): Household {
  return {
    id,
    name: String(data.name ?? 'Household'),
    members: Array.isArray(data.members) ? data.members.map(String) : [],
    joined: Array.isArray(data.joined) ? data.joined.map(String) : [],
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
  };
}

/** Starts a household with only its creator; others are invited from inside. */
export async function createHousehold(db: Firestore, email: string, name: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), { name: name.trim(), members: [normalizeEmail(email)], createdAt: Date.now() });
  return ref.id;
}

/** Invites by email: they get every app the next time they sign in with that Google account. */
export async function inviteMember(db: Firestore, householdId: string, email: string): Promise<void> {
  const address = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error(`Not an email address: ${email}`);
  await updateDoc(doc(db, COLLECTION, householdId), { members: arrayUnion(address) });
}

export async function removeMember(db: Firestore, householdId: string, email: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, householdId), { members: arrayRemove(normalizeEmail(email)) });
}

/** Records the signed-in member's first visit; harmless to call on every sign-in. */
export async function markJoined(db: Firestore, household: Household, email: string): Promise<void> {
  const address = normalizeEmail(email);
  if (household.joined.includes(address) || !household.members.includes(address)) return;
  await updateDoc(doc(db, COLLECTION, household.id), { joined: arrayUnion(address) });
}

/** Members who were invited but have not signed in yet. */
export function pendingMembers(household: Household): string[] {
  return household.members.filter((m) => !household.joined.includes(m));
}

/**
 * A member's name and photo as their own Google account reports them. Google has no public lookup
 * from an email to a profile, so each member records their own on sign-in
 * (`households/{id}/profiles/{email}`, writable only by that member).
 */
export interface Profile {
  email: string;
  name?: string;
  photoURL?: string;
  updatedAt: number;
}

/**
 * Records the signed-in member's name and photo; cheap to call on every sign-in. Also tags this
 * visit's usage counts with the household's hash (`./observability`), so active households can be
 * counted without knowing which.
 */
export async function saveMyProfile(
  db: Firestore,
  householdId: string,
  user: { email: string | null; displayName: string | null; photoURL: string | null },
): Promise<void> {
  if (!user.email) return;
  const email = normalizeEmail(user.email);
  const profile: Record<string, unknown> = { updatedAt: Date.now() };
  if (user.displayName) profile.name = user.displayName.slice(0, 100);
  if (user.photoURL?.startsWith('https://')) profile.photoURL = user.photoURL.slice(0, 500);
  void observeHousehold(householdId);
  await setDoc(doc(db, COLLECTION, householdId, 'profiles', email), profile);
}

/** Follows the profiles members have recorded, keyed by email. */
export function watchProfiles(
  db: Firestore,
  householdId: string,
  onChange: (profiles: Map<string, Profile>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION, householdId, 'profiles'),
    (snap) =>
      onChange(
        new Map(
          snap.docs.map((d) => {
            const data = d.data();
            return [
              d.id,
              {
                email: d.id,
                name: typeof data.name === 'string' ? data.name : undefined,
                photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
                updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
              },
            ];
          }),
        ),
      ),
    (error) => onError?.(error),
  );
}
