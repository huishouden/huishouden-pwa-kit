import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { addDoc, deleteDoc, deleteField, setDoc, updateDoc, writeBatch } from './firestore.js';
import { CONTACT_PAY_COLLECTION, cleanContact, cleanContactPay, contactPayDoc, tidyContactPay, toContact, withContactPay, } from './contact-core.js';
/**
 * The household's contacts over the Firebase SDK. The data contract and the screen helpers are in
 * `./contact-core` (re-exported here), which servers import without Firebase.
 */
export * from './contact-core.js';
const contactsOf = (db, householdId) => collection(db, 'households', householdId, 'contacts');
const payOf = (db, householdId) => collection(db, 'households', householdId, CONTACT_PAY_COLLECTION);
/**
 * Follows the household's contacts, optionally only those shown in one app, sorted by name. Pass
 * `restricted` for helpers and kids: the rules refuse them a list that could include private ones,
 * and pay details. For admins and members each contact carries its pay details (`contactPay`), the
 * first list waits for both, and once both have come from the server any pay details still on a
 * contact's own document are moved to `contactPay` and those of deleted contacts removed.
 */
export function watchContacts(db, householdId, onChange, { app, restricted, by, onError } = {}) {
    const all = contactsOf(db, householdId);
    let raw = null;
    let payDocs = restricted ? [] : null;
    let fromServer = { contacts: false, pay: !!restricted };
    let tidied = false;
    const tidy = () => {
        if (restricted || tidied || !raw || !payDocs || !fromServer.contacts || !fromServer.pay)
            return;
        tidied = true;
        tidyPay(db, householdId, raw, payDocs, by).catch((e) => console.warn('Moving contact pay details failed', e));
    };
    const emit = () => {
        if (!raw || !payDocs)
            return;
        const pay = new Map();
        for (const p of payDocs) {
            const clean = cleanContactPay(p.data);
            if (clean)
                pay.set(p.id, clean);
        }
        onChange(withContactPay(raw.map((d) => toContact(d.id, d.data)), pay)
            .filter((c) => !app || c.apps.includes(app))
            .sort((a, b) => a.name.localeCompare(b.name)));
    };
    const unsubs = [
        onSnapshot(restricted ? query(all, where('private', '==', false)) : all, { includeMetadataChanges: !restricted }, (snap) => {
            const first = raw === null;
            raw = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
            if (!snap.metadata.fromCache)
                fromServer = { ...fromServer, contacts: true };
            // With metadata changes on (for the tidy), a snapshot that only says "now from the server" isn't a new list.
            if (first || snap.docChanges().length)
                emit();
            tidy();
        }, (error) => onError?.(error)),
    ];
    if (!restricted) {
        unsubs.push(onSnapshot(payOf(db, householdId), { includeMetadataChanges: true }, (snap) => {
            const first = payDocs === null;
            payDocs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
            if (!snap.metadata.fromCache)
                fromServer = { ...fromServer, pay: true };
            if (first || snap.docChanges().length)
                emit();
            tidy();
        }, 
        // Contacts still show without their pay details (rules not yet deployed, a role just changed).
        (error) => {
            console.warn('Contact pay details unavailable', error);
            payDocs = [];
            emit();
        }));
    }
    return () => unsubs.forEach((u) => u());
}
async function tidyPay(db, householdId, contacts, pay, by) {
    const now = Date.now();
    const { moves, orphans } = tidyContactPay(contacts, pay, now);
    const existing = new Set(pay.map((p) => p.id));
    const writes = [
        ...moves.map((m) => (batch) => {
            const data = cleanContactPay(m.pay);
            if (data)
                batch.set(doc(payOf(db, householdId), m.id), { ...data, updatedAt: now, ...(by ? { by } : {}) });
            else if (existing.has(m.id))
                batch.delete(doc(payOf(db, householdId), m.id));
            batch.update(doc(contactsOf(db, householdId), m.id), { pay: deleteField() });
        }),
        ...orphans.map((id) => (batch) => batch.delete(doc(payOf(db, householdId), id))),
    ];
    for (let i = 0; i < writes.length; i += 200) {
        const batch = writeBatch(db);
        for (const w of writes.slice(i, i + 200))
            w(batch);
        await batch.commit();
    }
}
/** Writes the contact's pay details (`contactPay`) in `batch`: set, or deleted when none are left. */
function putPay(batch, db, householdId, id, pay, by, now) {
    const data = contactPayDoc(pay, by, now);
    const ref = doc(payOf(db, householdId), id);
    if (data)
        batch.set(ref, data);
    else
        batch.delete(ref);
}
/** Adds a contact; its pay details, when `input` has some, go to `contactPay` (admins and members only). */
export async function addContact(db, householdId, input, by) {
    const now = Date.now();
    const data = { ...cleanContact(input), createdAt: now, by };
    if (!cleanContactPay(input.pay))
        return (await addDoc(contactsOf(db, householdId), data)).id;
    const ref = doc(contactsOf(db, householdId));
    const batch = writeBatch(db);
    batch.set(ref, data);
    putPay(batch, db, householdId, ref.id, input.pay, by, now);
    await batch.commit();
    return ref.id;
}
/**
 * Replaces the contact's details; fields left empty are removed. Pay details are replaced only when
 * `input` has `pay` (`{}` removes them), so an app that doesn't show them never drops them, and a
 * helper's or kid's save (which never has them) never touches them.
 */
export async function updateContact(db, householdId, id, input, by) {
    const now = Date.now();
    const cleaned = cleanContact(input);
    const update = { ...cleaned, updatedAt: now, by };
    for (const k of ['role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes'])
        if (!(k in cleaned))
            update[k] = deleteField();
    if (!('pay' in input))
        return updateDoc(doc(contactsOf(db, householdId), id), update);
    const batch = writeBatch(db);
    batch.update(doc(contactsOf(db, householdId), id), update);
    putPay(batch, db, householdId, id, input.pay, by, now);
    await batch.commit();
}
/**
 * Remembers one pay detail for a contact (the Zelle phone a bill was paid to), keeping the others;
 * an empty value forgets it. Admins and members only (the rules).
 */
export async function setContactPay(db, householdId, id, kind, value, by) {
    const v = cleanContactPay({ [kind]: value })?.[kind];
    await setDoc(doc(payOf(db, householdId), id), { [kind]: v ?? deleteField(), updatedAt: Date.now(), by }, { merge: true });
}
/**
 * Deletes a contact. With `pay` (an admin or member, whose contacts carry it) its pay details go
 * too; a helper's or kid's deletion leaves them for an admin's or member's app to remove a day later.
 */
export async function deleteContact(db, householdId, id, { pay = false } = {}) {
    if (!pay)
        return deleteDoc(doc(contactsOf(db, householdId), id));
    const batch = writeBatch(db);
    batch.delete(doc(contactsOf(db, householdId), id));
    batch.delete(doc(payOf(db, householdId), id));
    await batch.commit();
}
/**
 * What deleting a contact in one app means: it stops showing there, and is only deleted outright
 * when no other app shows it (the pediatrician stays in a health app after Baby drops it).
 */
export async function removeContactFromApp(db, householdId, contact, app, by) {
    const others = contact.apps.filter((a) => a !== app);
    if (others.length === 0)
        return deleteContact(db, householdId, contact.id, { pay: !!contact.pay });
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
/**
 * Puts a deleted contact back under its old id (Undo), so appointments that point at it still do,
 * with its pay details when it carried them (an admin's or member's contact).
 */
export async function restoreContact(db, householdId, contact) {
    const { id, createdAt, updatedAt, by, ...input } = contact;
    const data = { ...cleanContact(input), createdAt, ...(updatedAt ? { updatedAt } : {}), by };
    if (!cleanContactPay(contact.pay))
        return setDoc(doc(contactsOf(db, householdId), id), data);
    const batch = writeBatch(db);
    batch.set(doc(contactsOf(db, householdId), id), data);
    // No `by`: whoever undoes may not be who last wrote them, and the rules take `by` as the writer.
    batch.set(doc(payOf(db, householdId), id), { ...cleanContactPay(contact.pay), updatedAt: Date.now() });
    await batch.commit();
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
