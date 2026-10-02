import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { addDoc, deleteDoc, deleteField, setDoc, updateDoc, writeBatch } from './firestore.js';
export const CONTACT_FIELDS = [
    'name', 'role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes', 'apps', 'private', 'createdAt', 'updatedAt', 'by',
];
const contactsOf = (db, householdId) => collection(db, 'households', householdId, 'contacts');
/** Drops empty optional fields so documents only carry what was filled in; `private` is always written. */
export function cleanContact(input) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (typeof v === 'string') {
            if (v.trim())
                out[k] = v.trim();
        }
        else if (v !== undefined)
            out[k] = v;
    }
    out.private = input.private === true;
    return out;
}
export function toContact(id, data) {
    const str = (k) => (typeof data[k] === 'string' ? data[k] : undefined);
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
/**
 * Follows the household's contacts, optionally only those shown in one app, sorted by name. Pass
 * `restricted` for helpers and kids: the rules refuse them a list that could include private ones.
 */
export function watchContacts(db, householdId, onChange, { app, restricted, onError } = {}) {
    const all = contactsOf(db, householdId);
    return onSnapshot(restricted ? query(all, where('private', '==', false)) : all, (snap) => onChange(snap.docs
        .map((d) => toContact(d.id, d.data()))
        .filter((c) => !app || c.apps.includes(app))
        .sort((a, b) => a.name.localeCompare(b.name))), (error) => onError?.(error));
}
export async function addContact(db, householdId, input, by) {
    const ref = await addDoc(contactsOf(db, householdId), { ...cleanContact(input), createdAt: Date.now(), by });
    return ref.id;
}
/** Replaces the contact's details; fields left empty are removed. */
export async function updateContact(db, householdId, id, input, by) {
    const cleaned = cleanContact(input);
    const update = { ...cleaned, updatedAt: Date.now(), by };
    for (const k of ['role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes'])
        if (!(k in cleaned))
            update[k] = deleteField();
    await updateDoc(doc(contactsOf(db, householdId), id), update);
}
export async function deleteContact(db, householdId, id) {
    await deleteDoc(doc(contactsOf(db, householdId), id));
}
/**
 * What deleting a contact in one app means: it stops showing there, and is only deleted outright
 * when no other app shows it (the pediatrician stays in a health app after Baby drops it).
 */
export async function removeContactFromApp(db, householdId, contact, app, by) {
    const others = contact.apps.filter((a) => a !== app);
    if (others.length === 0)
        return deleteContact(db, householdId, contact.id);
    await updateDoc(doc(contactsOf(db, householdId), contact.id), { apps: others, updatedAt: Date.now(), by });
}
/**
 * Writes `private: false` on records saved before the flag existed, which helpers and kids can't
 * read until then. Admins and members only (`can(role, 'see-private')`), for any private-capable
 * collection (contacts, an app's appointments); cheap to run whenever the list loads, since it
 * writes only records without the flag.
 */
export async function markUnflaggedOpen(db, householdId, collectionName, records) {
    const unflagged = records.filter((r) => typeof r.private !== 'boolean');
    for (let i = 0; i < unflagged.length; i += 450) {
        const batch = writeBatch(db);
        for (const r of unflagged.slice(i, i + 450))
            batch.update(doc(db, 'households', householdId, collectionName, r.id), { private: false });
        await batch.commit();
    }
    return unflagged.length;
}
/** Puts a deleted contact back under its old id (Undo), so appointments that point at it still do. */
export async function restoreContact(db, householdId, contact) {
    const { id, createdAt, updatedAt, by, ...input } = contact;
    await setDoc(doc(contactsOf(db, householdId), id), {
        ...cleanContact(input),
        createdAt,
        ...(updatedAt ? { updatedAt } : {}),
        by,
    });
}
// ---- Helpers for an app's contacts screen and dialog ----
/** Field lengths the household rules allow for contacts. */
export const CONTACT_LIMITS = { name: 120, role: 60, phone: 40, email: 120, website: 300, address: 300, notes: 1000 };
/**
 * Contacts grouped by role: the app's known `roles` first in their order (matched ignoring case),
 * then typed roles A–Z, then contacts without a role as "Other". Names A–Z within each group.
 */
export function groupContacts(contacts, roles) {
    const groups = new Map();
    for (const c of [...contacts].sort((a, b) => a.name.localeCompare(b.name))) {
        const typed = c.role?.trim();
        const role = (typed && (roles.find((r) => r.toLowerCase() === typed.toLowerCase()) ?? typed)) || 'Other';
        groups.set(role, [...(groups.get(role) ?? []), c]);
    }
    const rank = (role) => {
        const i = roles.indexOf(role);
        if (i >= 0)
            return i;
        return role === 'Other' ? roles.length + 2 : roles.length + 1;
    };
    return [...groups.entries()]
        .map(([role, list]) => ({ role, contacts: list }))
        .sort((a, b) => rank(a.role) - rank(b.role) || a.role.localeCompare(b.role));
}
/** "example.com" → "https://example.com"; empty stays empty. */
export function normalizeWebsite(url) {
    const t = url?.trim();
    if (!t)
        return undefined;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
/** "https://www.example.com/kids/" → "example.com/kids", for showing a link compactly. */
export function displayWebsite(url) {
    return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}
/** What a contact dialog saves: trimmed to the rules' limits, the website made a full URL, and shown in `app`. */
export function contactInput(fields, apps, app) {
    const cut = (s, max) => s?.trim().slice(0, max) || undefined;
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
