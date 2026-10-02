import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

/**
 * The household's contacts: the people and businesses it deals with (a pediatrician, the vet, the
 * lawn service). One collection, `households/{id}/contacts`, shared by every app; `apps` says
 * which apps show a contact, so the pediatrician appears in Baby and later in a health app too.
 *
 * Fields match the rules exactly (see CONTACT_FIELDS); keep them in step.
 */
export interface Contact {
  id: string;
  name: string;
  /** What they are to the household: "Pediatrician", "Vet", "Lawn service". */
  role?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  mapsUrl?: string;
  notes?: string;
  /** Apps that show this contact, by short name: ["baby"]. */
  apps: string[];
  createdAt: number;
  updatedAt?: number;
  by: string;
}

export const CONTACT_FIELDS = [
  'name', 'role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes', 'apps', 'createdAt', 'updatedAt', 'by',
] as const;

export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'by'>;

const contactsOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, 'contacts');

/** Drops empty optional fields so documents only carry what was filled in. */
export function cleanContact(input: ContactInput): ContactInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim();
    } else if (v !== undefined) out[k] = v;
  }
  return out as ContactInput;
}

export function toContact(id: string, data: Record<string, unknown>): Contact {
  const str = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : undefined);
  return {
    id,
    name: str('name') ?? '',
    role: str('role'),
    phone: str('phone'),
    email: str('email'),
    website: str('website'),
    address: str('address'),
    mapsUrl: str('mapsUrl'),
    notes: str('notes'),
    apps: Array.isArray(data.apps) ? data.apps.map(String) : [],
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
    by: str('by') ?? '',
  };
}

/** Follows the household's contacts, optionally only those shown in one app, sorted by name. */
export function watchContacts(
  db: Firestore,
  householdId: string,
  onChange: (contacts: Contact[]) => void,
  { app, onError }: { app?: string; onError?: (error: Error) => void } = {},
): Unsubscribe {
  return onSnapshot(
    contactsOf(db, householdId),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => toContact(d.id, d.data()))
          .filter((c) => !app || c.apps.includes(app))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    (error) => onError?.(error),
  );
}

export async function addContact(db: Firestore, householdId: string, input: ContactInput, by: string): Promise<string> {
  const ref = await addDoc(contactsOf(db, householdId), { ...cleanContact(input), createdAt: Date.now(), by });
  return ref.id;
}

/** Replaces the contact's details; fields left empty are removed. */
export async function updateContact(db: Firestore, householdId: string, id: string, input: ContactInput, by: string): Promise<void> {
  const cleaned = cleanContact(input) as Record<string, unknown>;
  const update: Record<string, unknown> = { ...cleaned, updatedAt: Date.now(), by };
  for (const k of ['role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes']) if (!(k in cleaned)) update[k] = deleteField();
  await updateDoc(doc(contactsOf(db, householdId), id), update);
}

export async function deleteContact(db: Firestore, householdId: string, id: string): Promise<void> {
  await deleteDoc(doc(contactsOf(db, householdId), id));
}

/**
 * What deleting a contact in one app means: it stops showing there, and is only deleted outright
 * when no other app shows it (the pediatrician stays in a health app after Baby drops it).
 */
export async function removeContactFromApp(db: Firestore, householdId: string, contact: Contact, app: string, by: string): Promise<void> {
  const others = contact.apps.filter((a) => a !== app);
  if (others.length === 0) return deleteContact(db, householdId, contact.id);
  await updateDoc(doc(contactsOf(db, householdId), contact.id), { apps: others, updatedAt: Date.now(), by });
}

/** Puts a deleted contact back under its old id (Undo), so appointments that point at it still do. */
export async function restoreContact(db: Firestore, householdId: string, contact: Contact): Promise<void> {
  const { id, createdAt, updatedAt, by, ...input } = contact;
  await setDoc(doc(contactsOf(db, householdId), id), {
    ...cleanContact(input),
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
    by,
  });
}
