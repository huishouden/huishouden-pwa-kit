import type { Auth } from 'firebase/auth';
import type { ParsedContact } from './vcard';
/**
 * Finds people in the member's Google Contacts (read-only, People API), to fill a household
 * contact from one tap: their saved contacts and the "other contacts" Gmail keeps for people they
 * have emailed. The app never writes to Google Contacts.
 *
 * The token comes from Google Identity Services (`./google-token`), so call `googleContactsToken`
 * from a tap. Browser tests stand in with `window.__mockGoogleContactsToken` and answer
 * people.googleapis.com themselves (Playwright's `page.route`).
 */
export declare const GOOGLE_CONTACTS_SCOPES: readonly ["https://www.googleapis.com/auth/contacts.readonly", "https://www.googleapis.com/auth/contacts.other.readonly"];
/** People shown for one search. */
export declare const GOOGLE_CONTACTS_LIMIT = 10;
declare global {
    interface Window {
        /** Browser tests: a Google Contacts token this device already has. */
        __mockGoogleContactsToken?: string;
    }
}
/** A token that can read Google Contacts: from a tap, asking once; kept for its hour on this device. */
export declare function googleContactsToken(auth: Auth): Promise<string>;
/** The Google Contacts search can be offered: a member is signed in (or a test stands in). */
export declare function googleContactsAvailable(auth: Auth | null | undefined): boolean;
interface RawField {
    value?: string;
    formattedValue?: string;
    formattedType?: string;
    type?: string;
    displayName?: string;
    name?: string;
    title?: string;
    metadata?: {
        primary?: boolean;
    };
}
export interface RawPerson {
    resourceName?: string;
    names?: RawField[];
    phoneNumbers?: RawField[];
    emailAddresses?: RawField[];
    addresses?: RawField[];
    organizations?: RawField[];
    urls?: RawField[];
    biographies?: RawField[];
}
/** One person from the People API, in the same shape as a parsed contact card; null when empty. */
export declare function fromGooglePerson(p: RawPerson): ParsedContact | null;
/**
 * Up to ten people matching `query` (a name, email or phone) in the member's Google Contacts:
 * saved contacts first, then the "other contacts" Gmail keeps, without repeats.
 */
export declare function searchGoogleContacts(token: string, query: string): Promise<ParsedContact[]>;
/** Tests only: forget which searches were warmed up. */
export declare function resetGoogleContactsForTests(): void;
export {};
