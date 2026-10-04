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
export declare const CONTACT_FIELDS: readonly ["name", "role", "phone", "email", "website", "address", "mapsUrl", "notes", "apps", "private", "createdAt", "updatedAt", "by"];
export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'by'>;
/** Drops empty optional fields so documents only carry what was filled in; `private` is always written. */
export declare function cleanContact(input: ContactInput): ContactInput;
export declare function toContact(id: string, data: Record<string, unknown>): Contact;
/** Field lengths the household rules allow for contacts. */
export declare const CONTACT_LIMITS: {
    readonly name: 120;
    readonly role: 60;
    readonly phone: 40;
    readonly email: 120;
    readonly website: 300;
    readonly address: 300;
    readonly notes: 1000;
};
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
export declare function groupContacts(contacts: Contact[], roles: readonly string[], roleLabel?: (role: string) => string): ContactGroup[];
/** "example.com" → "https://example.com"; empty stays empty. */
export declare function normalizeWebsite(url: string | undefined): string | undefined;
/** "https://www.example.com/kids/" → "example.com/kids", for showing a link compactly. */
export declare function displayWebsite(url: string): string;
/** What a contact dialog saves: trimmed to the rules' limits, the website made a full URL, and shown in `app`. */
export declare function contactInput(fields: Omit<ContactInput, 'apps'>, apps: string[], app: string): ContactInput;
