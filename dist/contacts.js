import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { addDoc, deleteDoc, deleteField, setDoc, updateDoc, writeBatch } from './firestore.js';
import { cleanContact, cleanContactPay, toContact } from './contact-core.js';
/**
 * The household's contacts over the Firebase SDK. The data contract and the screen helpers are in
 * `./contact-core` (re-exported here), which servers import without Firebase.
 */
export * from './contact-core.js';
const contactsOf = (db, householdId) => collection(db, 'households', householdId, 'contacts');
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
/**
 * Replaces the contact's details; fields left empty are removed. Pay details are replaced only when
 * `input` has `pay` (`{}` removes them), so an app that doesn't show them never drops them.
 */
export async function updateContact(db, householdId, id, input, by) {
    const cleaned = cleanContact(input);
    const update = { ...cleaned, updatedAt: Date.now(), by };
    for (const k of ['role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes'])
        if (!(k in cleaned))
            update[k] = deleteField();
    if ('pay' in input && !('pay' in cleaned))
        update.pay = deleteField();
    await updateDoc(doc(contactsOf(db, householdId), id), update);
}
/**
 * Remembers one pay detail on a contact (the Zelle phone a bill was paid to), keeping the others;
 * an empty value forgets it. Admins and members only (the rules).
 */
export async function setContactPay(db, householdId, id, kind, value, by) {
    const v = cleanContactPay({ [kind]: value })?.[kind];
    await updateDoc(doc(contactsOf(db, householdId), id), { [`pay.${kind}`]: v ?? deleteField(), updatedAt: Date.now(), by });
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
/**
 * The contact writes for an app's signed-out sample, on a list in memory: a save is cleaned and
 * stamped like `addContact` / `updateContact`, a removal drops it from the list, a restore puts it
 * back under its id. A list sorted by name stays sorted.
 */
export function sampleContacts(read, write, { by, now, newId }) {
    const put = (contact) => write([...read().filter((c) => c.id !== contact.id), contact].sort((a, b) => a.name.localeCompare(b.name)));
    return {
        save: (id, input) => {
            const existing = id ? read().find((c) => c.id === id) : undefined;
            const t = now();
            // As updateContact: pay details left out of `input` are kept.
            const kept = existing?.pay && !('pay' in input) ? { pay: existing.pay } : {};
            put({ id: id ?? newId(), ...kept, ...cleanContact(input), createdAt: existing?.createdAt ?? t, ...(existing ? { updatedAt: t } : {}), by });
        },
        remove: (contact) => write(read().filter((c) => c.id !== contact.id)),
        restore: put,
    };
}
/** The contact writes for a signed-in household, each failure passed to `report` (an error toast). */
export function householdContacts(db, householdId, app, by, report) {
    return {
        save: (id, input) => report(id ? updateContact(db, householdId, id, input, by) : addContact(db, householdId, input, by)),
        // A contact other apps also show stays for them; this app only stops showing it.
        remove: (contact) => report(removeContactFromApp(db, householdId, contact, app, by)),
        restore: (contact) => report(restoreContact(db, householdId, contact)),
    };
}
export { SHARED_CONTACT_KEY, SHARED_CONTACT_PARAM, SHARE_CACHE, clearSharedContact, contactFromCard, contactPickerSupported, contactSummary, fromPickerContact, isVCard, parseVCard, pickContact, readSharedContact, } from './vcard';
export { GOOGLE_CONTACTS_LIMIT, GOOGLE_CONTACTS_SCOPES, fromGooglePerson, googleContactsAvailable, googleContactsToken, searchGoogleContacts } from './google-contacts';
