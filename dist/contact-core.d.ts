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
export declare const CONTACT_FIELDS: readonly ["name", "role", "phone", "email", "website", "address", "mapsUrl", "notes", "apps", "private", "createdAt", "updatedAt", "by"];
/**
 * Where a contact's pay details live: `households/{id}/contactPay/{contactId}`, admins and members
 * only. Its fields are the ways of paying plus `updatedAt` and `by` (CONTACT_PAY_FIELDS).
 */
export declare const CONTACT_PAY_COLLECTION = "contactPay";
/** Ways of paying a contact that carry a detail worth remembering, in the order forms show them. */
export declare const CONTACT_PAY_KINDS: readonly ["zelle", "venmo", "bank", "check", "portal"];
export type ContactPayKind = (typeof CONTACT_PAY_KINDS)[number];
/** A contact's pay details by way of paying (`Contact.pay`). */
export type ContactPay = Partial<Record<ContactPayKind, string>>;
/** Lengths the household rules allow for each pay detail; `portal` is an https:// link. */
export declare const CONTACT_PAY_LIMITS: {
    readonly zelle: 120;
    readonly venmo: 60;
    readonly bank: 200;
    readonly check: 300;
    readonly portal: 500;
};
/**
 * Pay details as stored: known ways only, trimmed to their limits, a portal only as an https://
 * link, empty ones left out. Undefined when nothing is left.
 */
export declare function cleanContactPay(pay: unknown): ContactPay | undefined;
export declare const CONTACT_PAY_FIELDS: readonly ["zelle", "venmo", "bank", "check", "portal", "updatedAt", "by"];
/**
 * The `contactPay` document for these pay details, or null when none are left (delete it then).
 */
export declare function contactPayDoc(pay: unknown, by: string, now: number): (ContactPay & {
    updatedAt: number;
    by: string;
}) | null;
/** Contacts with their pay details (`contactPay` documents by contact id) attached. */
export declare function withContactPay<C extends Contact>(contacts: C[], pay: ReadonlyMap<string, ContactPay>): C[];
export interface ContactPayTidy {
    /** Pay details still on a contact's own document (saved before they moved): copy, then remove there. */
    moves: {
        id: string;
        pay: ContactPay;
    }[];
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
export declare function tidyContactPay(contacts: {
    id: string;
    data: Record<string, unknown>;
}[], pay: {
    id: string;
    data: Record<string, unknown>;
}[], now: number, orphanAfter?: number): ContactPayTidy;
export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'by'>;
/**
 * The contact's document: empty optional fields dropped so it only carries what was filled in;
 * `private` always written. Pay details are never on it (`contactPayDoc`).
 */
export declare function cleanContact(input: ContactInput): ContactInput;
/** `lat` and `lng` when both are on the map; undefined otherwise. */
export declare function coordinates(d: {
    lat?: unknown;
    lng?: unknown;
} | undefined): {
    lat: number;
    lng: number;
} | undefined;
/** A contact document as a Contact. Pay details are read from `contactPay`, never from here. */
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
/**
 * What a contact dialog saves: trimmed to the rules' limits, the website made a full URL, and shown in `app`.
 * `pay`, when given, is kept even when empty (`{}`), so `updateContact` removes cleared pay details;
 * left out, a contact's pay details are kept as they are.
 */
export declare function contactInput(fields: Omit<ContactInput, 'apps'>, apps: string[], app: string): ContactInput;
/** How long an address the map couldn't find waits before it is looked up again: 30 days. */
export declare const POSITION_RETRY_MS: number;
/** How many contacts one load looks up at most. */
export declare const POSITION_BACKFILL_LIMIT = 10;
/**
 * Whether a contact document has an address but no position, and the map wasn't asked about it in
 * the last `POSITION_RETRY_MS` (`geoTried`, the ms of a lookup that found nothing).
 */
export declare function needsPosition(data: Record<string, unknown> | undefined, now: number): boolean;
/** What the backfill writes on a contact: its position, or when the map had no match. */
export type PositionUpdate = {
    lat: number;
    lng: number;
} | {
    geoTried: number;
};
export interface PositionBackfillOptions {
    /** The address's position, or null when the map has no match. Throws when the service can't answer. */
    geocode: (address: string) => Promise<{
        lat: number;
        lng: number;
    } | null>;
    write: (id: string, update: PositionUpdate) => Promise<void>;
    /** The contact's document as it is now, so one edited or deleted meanwhile is left alone. */
    current?: (id: string) => Record<string, unknown> | undefined;
    /** Resolves when the page is showing; false to stop instead. */
    whenVisible?: () => Promise<boolean>;
    limit?: number;
    now?: () => number;
    signal?: AbortSignal;
}
export interface PositionBackfillResult {
    located: string[];
    /** Marked `geoTried`: the map had no match. */
    missed: string[];
}
/**
 * Looks up, one at a time, up to `limit` contacts that `needsPosition`, and writes each one's
 * position, or `geoTried` when the map has no match. Stops at the first lookup or write that fails
 * (the service is busy, offline, the rules refused), leaving the rest for the next load.
 */
export declare function backfillPositions(docs: {
    id: string;
    data: Record<string, unknown>;
}[], { geocode, write, current, whenVisible, limit, now, signal }: PositionBackfillOptions): Promise<PositionBackfillResult>;
