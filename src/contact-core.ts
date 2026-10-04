import { kt } from './i18n.js';

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
  /** Where the address is, when a map search found it: for "2.3 mi from home" (`./home`). */
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  notes?: string;
  /**
   * How the household pays them, by way of paying, remembered from a bill so the next one fills
   * in: the Zelle phone or email, the Venmo @handle, bank details, the mailing address for a
   * check, the online portal's link. Money, so it is not on the contact's document (which helpers
   * and kids read) but in `households/{id}/contactPay/{contactId}`, which only admins and members
   * read and write; loaded for them alone (`watchContacts` without `restricted`).
   */
  pay?: ContactPay;
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

/**
 * Where a contact's pay details live: `households/{id}/contactPay/{contactId}`, admins and members
 * only. Its fields are the ways of paying plus `updatedAt` and `by` (CONTACT_PAY_FIELDS).
 */
export const CONTACT_PAY_COLLECTION = 'contactPay';

/** Ways of paying a contact that carry a detail worth remembering, in the order forms show them. */
export const CONTACT_PAY_KINDS = ['zelle', 'venmo', 'bank', 'check', 'portal'] as const;
export type ContactPayKind = (typeof CONTACT_PAY_KINDS)[number];

/** A contact's pay details by way of paying (`Contact.pay`). */
export type ContactPay = Partial<Record<ContactPayKind, string>>;

/** Lengths the household rules allow for each pay detail; `portal` is an https:// link. */
export const CONTACT_PAY_LIMITS = { zelle: 120, venmo: 60, bank: 200, check: 300, portal: 500 } as const satisfies Record<ContactPayKind, number>;

/**
 * Pay details as stored: known ways only, trimmed to their limits, a portal only as an https://
 * link, empty ones left out. Undefined when nothing is left.
 */
export function cleanContactPay(pay: unknown): ContactPay | undefined {
  if (!pay || typeof pay !== 'object') return undefined;
  const out: ContactPay = {};
  for (const kind of CONTACT_PAY_KINDS) {
    const raw = (pay as Record<string, unknown>)[kind];
    const v = typeof raw === 'string' ? raw.trim().slice(0, CONTACT_PAY_LIMITS[kind]) : '';
    if (!v || (kind === 'portal' && !/^https:\/\/./i.test(v))) continue;
    out[kind] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export const CONTACT_PAY_FIELDS = [...CONTACT_PAY_KINDS, 'updatedAt', 'by'] as const;

/**
 * The `contactPay` document for these pay details, or null when none are left (delete it then).
 */
export function contactPayDoc(pay: unknown, by: string, now: number): (ContactPay & { updatedAt: number; by: string }) | null {
  const clean = cleanContactPay(pay);
  return clean ? { ...clean, updatedAt: now, by } : null;
}

/** Contacts with their pay details (`contactPay` documents by contact id) attached. */
export function withContactPay<C extends Contact>(contacts: C[], pay: ReadonlyMap<string, ContactPay>): C[] {
  return contacts.map((c) => {
    const { pay: _old, ...rest } = c;
    const p = pay.get(c.id);
    return (p ? { ...rest, pay: p } : rest) as C;
  });
}

export interface ContactPayTidy {
  /** Pay details still on a contact's own document (saved before they moved): copy, then remove there. */
  moves: { id: string; pay: ContactPay }[];
  /** `contactPay` documents whose contact is gone, untouched for `orphanAfter`: delete. */
  orphans: string[];
}

/**
 * What an admin's or member's app tidies once contacts and pay details have loaded from the server:
 * pay details on contact documents (written before they moved to `contactPay`) are moved, a
 * `contactPay` document already there winning way by way; pay details whose contact was deleted
 * (by a helper, who can't remove them) are deleted once older than `orphanAfter` (a day), so an
 * Undo of the deletion still finds them.
 */
export function tidyContactPay(
  contacts: { id: string; data: Record<string, unknown> }[],
  pay: { id: string; data: Record<string, unknown> }[],
  now: number,
  orphanAfter = 24 * 3600_000,
): ContactPayTidy {
  const payById = new Map(pay.map((p) => [p.id, p.data]));
  const ids = new Set(contacts.map((c) => c.id));
  const moves = contacts.flatMap((c) => {
    if (!('pay' in c.data)) return [];
    const merged = { ...(cleanContactPay(c.data.pay) ?? {}), ...(cleanContactPay(payById.get(c.id)) ?? {}) };
    return [{ id: c.id, pay: merged }];
  });
  const orphans = pay
    .filter((p) => !ids.has(p.id) && now - (typeof p.data.updatedAt === 'number' ? p.data.updatedAt : 0) > orphanAfter)
    .map((p) => p.id);
  return { moves, orphans };
}

export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'by'>;

/**
 * The contact's document: empty optional fields dropped so it only carries what was filled in;
 * `private` always written. Pay details are never on it (`contactPayDoc`).
 */
export function cleanContact(input: ContactInput): ContactInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'pay') continue;
    if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim();
    } else if (v !== undefined) out[k] = v;
  }
  out.private = input.private === true;
  return out as ContactInput;
}

/** `lat` and `lng` when both are on the map; undefined otherwise. */
export function coordinates(d: { lat?: unknown; lng?: unknown } | undefined): { lat: number; lng: number } | undefined {
  const ok = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
  return d && ok(d.lat, 90) && ok(d.lng, 180) ? { lat: d.lat, lng: d.lng } : undefined;
}

/** A contact document as a Contact. Pay details are read from `contactPay`, never from here. */
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
    ...(coordinates(data) ?? {}),
    apps: Array.isArray(data.apps) ? data.apps.map(String) : [],
    ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
    by: str('by') ?? '',
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
 * then typed roles A–Z, then contacts without a role as "Other" (in the active language). Names A–Z within each group.
 * With `roleLabel` (as on `ContactDialog`), a role typed as a known role's label ("Plomero") joins
 * that role's group; a group's `role` is still the stored one, shown with `roleLabel`.
 */
export function groupContacts(contacts: Contact[], roles: readonly string[], roleLabel?: (role: string) => string): ContactGroup[] {
  const other = kt('contacts.other');
  const groups = new Map<string, Contact[]>();
  const known = (typed: string) =>
    roles.find((r) => r.toLowerCase() === typed.toLowerCase()) ?? (roleLabel ? roles.find((r) => roleLabel(r).toLowerCase() === typed.toLowerCase()) : undefined);
  for (const c of [...contacts].sort((a, b) => a.name.localeCompare(b.name))) {
    const typed = c.role?.trim();
    const role = (typed && (known(typed) ?? typed)) || other;
    groups.set(role, [...(groups.get(role) ?? []), c]);
  }
  const rank = (role: string) => {
    const i = roles.indexOf(role);
    if (i >= 0) return i;
    return role === other ? roles.length + 2 : roles.length + 1;
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

/**
 * What a contact dialog saves: trimmed to the rules' limits, the website made a full URL, and shown in `app`.
 * `pay`, when given, is kept even when empty (`{}`), so `updateContact` removes cleared pay details;
 * left out, a contact's pay details are kept as they are.
 */
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
    // A position only with the address it belongs to.
    ...(fields.address?.trim() && coordinates(fields) ? coordinates(fields) : {}),
    notes: cut(fields.notes, CONTACT_LIMITS.notes),
    ...('pay' in fields ? { pay: cleanContactPay(fields.pay) ?? {} } : {}),
    apps: apps.includes(app) ? apps : [...apps, app],
    private: fields.private === true,
  };
}
