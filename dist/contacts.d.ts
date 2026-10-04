import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type Contact, type ContactInput, type ContactPayKind } from './contact-core.js';
/**
 * The household's contacts over the Firebase SDK. The data contract and the screen helpers are in
 * `./contact-core` (re-exported here), which servers import without Firebase.
 */
export * from './contact-core.js';
export interface WatchContactsOptions {
    /** Only those shown in this app. */
    app?: string;
    /**
     * A helper or kid (`isRestricted(role)`): only contacts not marked private, as the rules require,
     * and no pay details (never read, so no permission error either).
     */
    restricted?: boolean;
    /** Who is signed in, for the `by` of pay details tidied on load (see `tidyContactPay`). */
    by?: string;
    onError?: (error: Error) => void;
}
/**
 * Follows the household's contacts, optionally only those shown in one app, sorted by name. Pass
 * `restricted` for helpers and kids: the rules refuse them a list that could include private ones,
 * and pay details. For admins and members each contact carries its pay details (`contactPay`), the
 * first list waits for both, and once both have come from the server any pay details still on a
 * contact's own document are moved to `contactPay` and those of deleted contacts removed.
 */
export declare function watchContacts(db: Firestore, householdId: string, onChange: (contacts: Contact[]) => void, { app, restricted, by, onError }?: WatchContactsOptions): Unsubscribe;
/** Adds a contact; its pay details, when `input` has some, go to `contactPay` (admins and members only). */
export declare function addContact(db: Firestore, householdId: string, input: ContactInput, by: string): Promise<string>;
/**
 * Replaces the contact's details; fields left empty are removed. Pay details are replaced only when
 * `input` has `pay` (`{}` removes them), so an app that doesn't show them never drops them, and a
 * helper's or kid's save (which never has them) never touches them.
 */
export declare function updateContact(db: Firestore, householdId: string, id: string, input: ContactInput, by: string): Promise<void>;
/**
 * Remembers one pay detail for a contact (the Zelle phone a bill was paid to), keeping the others;
 * an empty value forgets it. Admins and members only (the rules).
 */
export declare function setContactPay(db: Firestore, householdId: string, id: string, kind: ContactPayKind, value: string, by: string): Promise<void>;
/**
 * Deletes a contact. With `pay` (an admin or member, whose contacts carry it) its pay details go
 * too; a helper's or kid's deletion leaves them for an admin's or member's app to remove a day later.
 */
export declare function deleteContact(db: Firestore, householdId: string, id: string, { pay }?: {
    pay?: boolean;
}): Promise<void>;
/**
 * What deleting a contact in one app means: it stops showing there, and is only deleted outright
 * when no other app shows it (the pediatrician stays in a health app after Baby drops it).
 */
export declare function removeContactFromApp(db: Firestore, householdId: string, contact: Contact, app: string, by: string): Promise<void>;
/**
 * Writes `private: false` on records saved before the flag existed, which helpers and kids can't
 * read until then. Admins and members only (`can(role, 'see-private')`), for any private-capable
 * collection (contacts, an app's appointments); cheap to run whenever the list loads, since it
 * writes only records without the flag.
 */
export declare function markUnflaggedOpen(db: Firestore, householdId: string, collectionName: string, records: {
    id: string;
    private?: unknown;
}[]): Promise<number>;
/**
 * Puts a deleted contact back under its old id (Undo), so appointments that point at it still do,
 * with its pay details when it carried them (an admin's or member's contact).
 */
export declare function restoreContact(db: Firestore, householdId: string, contact: Contact): Promise<void>;
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
export declare function sampleContacts(read: () => Contact[], write: (contacts: Contact[]) => void, { by, now, newId }: {
    by: string;
    now: () => number;
    newId: () => string;
}): ContactWrites;
/** The contact writes for a signed-in household, each failure passed to `report` (an error toast). */
export declare function householdContacts(db: Firestore, householdId: string, app: string, by: string, report: (write: Promise<unknown>) => void): ContactWrites;
export { SHARED_CONTACT_KEY, SHARED_CONTACT_PARAM, SHARE_CACHE, clearSharedContact, contactFromCard, contactPickerSupported, contactSummary, fromPickerContact, isVCard, parseVCard, pickContact, readSharedContact, } from './vcard';
export type { ContactFill, ContactFillOptions, LabelledValue, ParsedContact } from './vcard';
export { GOOGLE_CONTACTS_LIMIT, GOOGLE_CONTACTS_SCOPES, fromGooglePerson, googleContactsAvailable, googleContactsToken, searchGoogleContacts } from './google-contacts';
