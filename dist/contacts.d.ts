import { type Firestore, type Unsubscribe } from 'firebase/firestore';
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
export declare const CONTACT_FIELDS: readonly ["name", "role", "phone", "email", "website", "address", "mapsUrl", "notes", "apps", "createdAt", "updatedAt", "by"];
export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'by'>;
/** Drops empty optional fields so documents only carry what was filled in. */
export declare function cleanContact(input: ContactInput): ContactInput;
export declare function toContact(id: string, data: Record<string, unknown>): Contact;
/** Follows the household's contacts, optionally only those shown in one app, sorted by name. */
export declare function watchContacts(db: Firestore, householdId: string, onChange: (contacts: Contact[]) => void, { app, onError }?: {
    app?: string;
    onError?: (error: Error) => void;
}): Unsubscribe;
export declare function addContact(db: Firestore, householdId: string, input: ContactInput, by: string): Promise<string>;
/** Replaces the contact's details; fields left empty are removed. */
export declare function updateContact(db: Firestore, householdId: string, id: string, input: ContactInput, by: string): Promise<void>;
export declare function deleteContact(db: Firestore, householdId: string, id: string): Promise<void>;
