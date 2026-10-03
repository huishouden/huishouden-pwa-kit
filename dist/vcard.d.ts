/**
 * Contacts the person already has, read into the household's contact fields: a contact card file
 * (.vcf, vCard 2.1, 3.0 or 4.0, as iPhone, Android, Google Contacts and Outlook export them), the
 * phone's own contact picker (Contact Picker API, Chrome on Android), or a card shared into the
 * installed app (`pwaApp({ shareTarget: { contacts: true } })`).
 *
 * Nothing is uploaded: cards are read on the device. Photos are skipped.
 */
import { type ContactInput } from './contacts';
/** A phone number, email or website with what the card calls it ("Mobile", "Work", "Office"). */
export interface LabelledValue {
    value: string;
    label?: string;
}
/** One person or business from a contact card, picker or Google Contacts. */
export interface ParsedContact {
    /** The person's name, or the business's when the card has no person. */
    name: string;
    /** Preferred first, then in the card's order. */
    phones: LabelledValue[];
    emails: LabelledValue[];
    /** The first address, on one line: "12 Example Street, Apt 3, Springfield, IL 62704". */
    address?: string;
    organization?: string;
    /** Job title ("Property manager"). */
    title?: string;
    website?: string;
    note?: string;
}
/** The contact dialog's fields a parsed contact fills in. */
export type ContactFill = Partial<Pick<ContactInput, 'name' | 'role' | 'phone' | 'email' | 'website' | 'address' | 'notes'>>;
/**
 * Every contact in a contact card file (.vcf): vCard 2.1, 3.0 and 4.0, one or many cards, as
 * iPhone, Android, Google Contacts and Outlook export them. Folded lines, quoted-printable text in
 * any charset, Apple's custom labels ("item1.X-ABLabel") and TYPE parameters are understood;
 * photos are skipped. Cards with nothing usable are left out.
 */
export declare function parseVCard(input: string): ParsedContact[];
/** True when the text looks like a contact card. */
export declare const isVCard: (text: string) => boolean;
export interface ContactFillOptions {
    /** Fill the role from the card's job title and organization ("Property manager, Example Homes"); false when the dialog already has one. Default true. */
    role?: boolean;
}
/**
 * A parsed contact as the contact dialog's fields: the first phone and email, the rest in notes
 * with their labels, the organization as the name of a business card or (with the job title) as the
 * role of a person, and the card's own note. Each field cut to the rules' limits.
 */
export declare function contactFromCard(card: ParsedContact, { role: fillRole }?: ContactFillOptions): ContactFill;
/** One line under a contact's name in a "choose one" list: its first phone and email, or organization. */
export declare function contactSummary(card: ParsedContact): string;
interface PickerAddress {
    addressLine?: string[];
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
}
interface PickerContact {
    name?: string[];
    tel?: string[];
    email?: string[];
    address?: PickerAddress[];
}
/**
 * The phone's own contact picker is there (Chrome on Android; not Safari on iPhone, not desktop
 * browsers). Show "Pick from my contacts" only then.
 */
export declare function contactPickerSupported(): boolean;
/** A contact the picker returned, in the same shape as a parsed card. */
export declare function fromPickerContact(c: PickerContact): ParsedContact | null;
/**
 * Opens the phone's contact picker for one contact: name, phone numbers, emails and (where the
 * phone offers it) address. Call from a tap. Null when the person closes it without choosing.
 */
export declare function pickContact(): Promise<ParsedContact | null>;
/** The marker the share target's redirect puts on the app's address: `?share=contact`. */
export declare const SHARED_CONTACT_PARAM: {
    readonly share: "contact";
};
/** Where the service worker keeps a shared card until the app reads it (Cache Storage). */
export declare const SHARE_CACHE = "hh-share";
/** The cached card's key, relative to the app's scope. */
export declare const SHARED_CONTACT_KEY = "hh-shared-contact";
/**
 * The contact card(s) shared into the app (Contacts → Share → the app), or null when the app was
 * opened normally. The service worker keeps the shared file until this reads it, once; later calls
 * in the same page give the same answer. An empty list means a share arrived but held no card the
 * app could read. After opening the dialog, `clearSharedContact()` tidies the address bar.
 */
export declare function readSharedContact(location?: {
    search: string;
    pathname: string;
    origin: string;
}): Promise<ParsedContact[] | null>;
/** Takes `?share=contact` off the address bar without reloading. */
export declare function clearSharedContact(): void;
/** Tests only: forget the shared card this page read. */
export declare function resetSharedContactForTests(): void;
export {};
