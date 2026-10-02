import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, setDoc, updateDoc, } from 'firebase/firestore';
export const CONTACT_FIELDS = [
    'name', 'role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes', 'apps', 'createdAt', 'updatedAt', 'by',
];
const contactsOf = (db, householdId) => collection(db, 'households', householdId, 'contacts');
/** Drops empty optional fields so documents only carry what was filled in. */
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
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
        by: str('by') ?? '',
    };
}
/** Follows the household's contacts, optionally only those shown in one app, sorted by name. */
export function watchContacts(db, householdId, onChange, { app, onError } = {}) {
    return onSnapshot(contactsOf(db, householdId), (snap) => onChange(snap.docs
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
