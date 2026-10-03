import { collection, doc, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { addDoc, deleteDoc, deleteField, setDoc, updateDoc, writeBatch } from './firestore.js';

/**
 * The household's contacts: the people and businesses it deals with (a pediatrician, the vet, the
 * lawn service). One collection, `households/{id}/contacts`, shared by every app; `apps` says
 * which apps show a contact, so the pediatrician appears in Baby and later in a health app too.
 *
 * A contact marked `private` is for admins and members only (`./roles`); helpers and kids never
 * read it. Every save writes the flag, since one without it counts as private to them.
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
  /** Only admins and members see it. */
  private?: boolean;
  createdAt: number;
  updatedAt?: number;
  by: string;
}

export const CONTACT_FIELDS = [
  'name', 'role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes', 'apps', 'private', 'createdAt', 'updatedAt', 'by',
] as const;

export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'by'>;

const contactsOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, 'contacts');

/** Drops empty optional fields so documents only carry what was filled in; `private` is always written. */
export function cleanContact(input: ContactInput): ContactInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim();
    } else if (v !== undefined) out[k] = v;
  }
  out.private = input.private === true;
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
    ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
    by: str('by') ?? '',
  };
}

export interface WatchContactsOptions {
  /** Only those shown in this app. */
  app?: string;
  /** A helper or kid (`isRestricted(role)`): only contacts not marked private, as the rules require. */
  restricted?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Follows the household's contacts, optionally only those shown in one app, sorted by name. Pass
 * `restricted` for helpers and kids: the rules refuse them a list that could include private ones.
 */
export function watchContacts(
  db: Firestore,
  householdId: string,
  onChange: (contacts: Contact[]) => void,
  { app, restricted, onError }: WatchContactsOptions = {},
): Unsubscribe {
  const all = contactsOf(db, householdId);
  return onSnapshot(
    restricted ? query(all, where('private', '==', false)) : all,
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

/**
 * Writes `private: false` on records saved before the flag existed, which helpers and kids can't
 * read until then. Admins and members only (`can(role, 'see-private')`), for any private-capable
 * collection (contacts, an app's appointments); cheap to run whenever the list loads, since it
 * writes only records without the flag.
 */
export async function markUnflaggedOpen(db: Firestore, householdId: string, collectionName: string, records: { id: string; private?: unknown }[]): Promise<number> {
  const unflagged = records.filter((r) => typeof r.private !== 'boolean');
  for (let i = 0; i < unflagged.length; i += 450) {
    const batch = writeBatch(db);
    for (const r of unflagged.slice(i, i + 450)) batch.update(doc(db, 'households', householdId, collectionName, r.id), { private: false });
    await batch.commit();
  }
  return unflagged.length;
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

/** The three contact writes an app's actions make, over Firestore or the sample's memory. */
export interface ContactWrites {
  save(id: string | null, input: ContactInput): void;
  /** Stops showing it in this app (`removeContactFromApp`). */
  remove(contact: Contact): void;
  /** Puts it back as it was (Undo). */
  restore(contact: Contact): void;
}

/**
 * The contact writes for an app's signed-out sample, on a list in memory: a save is cleaned and
 * stamped like `addContact` / `updateContact`, a removal drops it from the list, a restore puts it
 * back under its id. A list sorted by name stays sorted.
 */
export function sampleContacts(
  read: () => Contact[],
  write: (contacts: Contact[]) => void,
  { by, now, newId }: { by: string; now: () => number; newId: () => string },
): ContactWrites {
  const put = (contact: Contact) => write([...read().filter((c) => c.id !== contact.id), contact].sort((a, b) => a.name.localeCompare(b.name)));
  return {
    save: (id, input) => {
      const existing = id ? read().find((c) => c.id === id) : undefined;
      const t = now();
      put({ id: id ?? newId(), ...cleanContact(input), createdAt: existing?.createdAt ?? t, ...(existing ? { updatedAt: t } : {}), by });
    },
    remove: (contact) => write(read().filter((c) => c.id !== contact.id)),
    restore: put,
  };
}

/** The contact writes for a signed-in household, each failure passed to `report` (an error toast). */
export function householdContacts(db: Firestore, householdId: string, app: string, by: string, report: (write: Promise<unknown>) => void): ContactWrites {
  return {
    save: (id, input) => report(id ? updateContact(db, householdId, id, input, by) : addContact(db, householdId, input, by)),
    // A contact other apps also show stays for them; this app only stops showing it.
    remove: (contact) => report(removeContactFromApp(db, householdId, contact, app, by)),
    restore: (contact) => report(restoreContact(db, householdId, contact)),
  };
}

// ---- Helpers for an app's contacts screen and dialog ----

/** Field lengths the household rules allow for contacts. */
export const CONTACT_LIMITS = { name: 120, role: 60, phone: 40, email: 120, website: 300, address: 300, notes: 1000 } as const;

export interface ContactGroup {
  role: string;
  contacts: Contact[];
}

/**
 * Contacts grouped by role: the app's known `roles` first in their order (matched ignoring case),
 * then typed roles A–Z, then contacts without a role as "Other". Names A–Z within each group.
 */
export function groupContacts(contacts: Contact[], roles: readonly string[]): ContactGroup[] {
  const groups = new Map<string, Contact[]>();
  for (const c of [...contacts].sort((a, b) => a.name.localeCompare(b.name))) {
    const typed = c.role?.trim();
    const role = (typed && (roles.find((r) => r.toLowerCase() === typed.toLowerCase()) ?? typed)) || 'Other';
    groups.set(role, [...(groups.get(role) ?? []), c]);
  }
  const rank = (role: string) => {
    const i = roles.indexOf(role);
    if (i >= 0) return i;
    return role === 'Other' ? roles.length + 2 : roles.length + 1;
  };
  return [...groups.entries()]
    .map(([role, list]) => ({ role, contacts: list }))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.role.localeCompare(b.role));
}

/** "example.com" → "https://example.com"; empty stays empty. */
export function normalizeWebsite(url: string | undefined): string | undefined {
  const t = url?.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** "https://www.example.com/kids/" → "example.com/kids", for showing a link compactly. */
export function displayWebsite(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

/** What a contact dialog saves: trimmed to the rules' limits, the website made a full URL, and shown in `app`. */
export function contactInput(fields: Omit<ContactInput, 'apps'>, apps: string[], app: string): ContactInput {
  const cut = (s: string | undefined, max: number) => s?.trim().slice(0, max) || undefined;
  return {
    name: fields.name.trim().slice(0, CONTACT_LIMITS.name),
    role: cut(fields.role, CONTACT_LIMITS.role),
    phone: cut(fields.phone, CONTACT_LIMITS.phone),
    email: cut(fields.email, CONTACT_LIMITS.email),
    website: cut(normalizeWebsite(fields.website), CONTACT_LIMITS.website),
    address: cut(fields.address, CONTACT_LIMITS.address),
    mapsUrl: fields.mapsUrl?.trim() || undefined,
    notes: cut(fields.notes, CONTACT_LIMITS.notes),
    apps: apps.includes(app) ? apps : [...apps, app],
    private: fields.private === true,
  };
}
