import type { Auth } from 'firebase/auth';
import { type Contact, type ContactInput } from '../contacts';
import { type ParsedContact } from '../vcard';
import { type ParsedPlace } from '../places';
/** A role as the field shows it: one of the app's roles in its shown name, anything typed as typed. */
export declare function shownRole(role: string, roles: readonly string[], roleLabel: (role: string) => string): string;
/** What to save for the field's text: one of the app's roles when it is that role's shown name, else the text. */
export declare function storedRole(text: string, roles: readonly string[], roleLabel: (role: string) => string): string;
export interface ContactDialogProps {
    contact: Contact | null;
    /** The app's id in `apps` ("baby"): a new contact shows there, an edited one keeps showing there. */
    app: string;
    /** Roles offered as one-tap chips; any other role can be typed. */
    roles: readonly string[];
    /**
     * How one of `roles` reads in the active language, when the app keeps them in English: "Plumber"
     * shows as "Plomero" on its chip and in the field, and is still saved as "Plumber" (so contacts
     * group the same whoever added them). Typing a role's shown name saves the role. Default: as is.
     */
    roleLabel?: (role: string) => string;
    /** Prefills the role for a new contact, e.g. from "Choose a pediatrician". */
    role?: string;
    /** Default "New contact" / "Edit contact"; Car says "New shop" / "Edit shop". */
    title?: {
        add: string;
        edit: string;
    };
    /** The business search's placeholder: "Practice name and town". */
    searchPlaceholder?: string;
    /** The name field's placeholder, an invented example: "Example Pediatrics". */
    namePlaceholder?: string;
    /**
     * Details to start a new contact with, e.g. `readSharedPlace(location)?.place` when the app was
     * opened from Google Maps' Share menu. Shown with what wasn't understood, for the person to check.
     */
    prefill?: ParsedPlace;
    /**
     * Contact cards shared into the app (`readSharedContact()` in `../contacts`): one fills the new
     * contact, several are listed to choose from.
     */
    sharedContacts?: ParsedContact[];
    /**
     * The app's Firebase Auth: with a member signed in, offers "Find in my Google Contacts"
     * (read-only, asks Google for permission on the first tap). Leave out to not offer it.
     */
    auth?: Auth | null;
    /** Reads a listing screenshot; defaults to on-device OCR (`readPlaceScreenshot`). Tests pass a stand-in. */
    readScreenshot?: (image: Blob, onProgress: (progress: number, status: string) => void) => Promise<ParsedPlace>;
    /**
     * Offers "Only admins and members" (`private`). Pass `can(role, 'see-private')`: helpers and kids
     * can't mark a contact private, and what they save stays visible to them. Default true.
     */
    canMarkPrivate?: boolean;
    onSave: (input: ContactInput) => void;
    onDelete?: () => void;
    onClose: () => void;
}
export declare function ContactDialog({ contact, app, roles, roleLabel, role: initialRole, title, searchPlaceholder, namePlaceholder, prefill, sharedContacts, auth, readScreenshot, canMarkPrivate, onSave, onDelete, onClose, }: ContactDialogProps): import("react").JSX.Element;
/**
 * "Only admins and members": the private flag on a contact or appointment (`./roles`), with its
 * one-line explanation. Show it only to those who may set it (`can(role, 'see-private')`).
 */
export declare function PrivateCheckbox({ checked, onChange }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
}): import("react").JSX.Element;
/** The quiet "Private" marker on a record only admins and members see. */
export declare function PrivateMark(): import("react").JSX.Element;
/**
 * One contact: role, name, edit and delete, then tap-to-call, email, website, address with a map
 * link, and notes. Leave out `onEdit` or `onDelete` where the person may not (a helper on a contact
 * someone else added).
 */
export declare function ContactCard({ contact: c, role, onEdit, onDelete }: {
    contact: Contact;
    role: string;
    onEdit?: () => void;
    onDelete?: () => void;
}): import("react").JSX.Element;
/**
 * Names one of the household's contacts on a record (who a bill is paid to, who does a job): a
 * select of `contacts` with their roles, "No one" (or `empty`) first. A contact that was removed
 * stays chosen and shows as removed, so saving doesn't drop it unseen.
 */
export declare function ContactSelect({ id, value, contacts, onChange, empty, roleLabel, label, }: {
    id?: string;
    /** The chosen contact's id, or '' for none. */
    value: string;
    contacts: readonly Contact[];
    onChange: (id: string) => void;
    empty?: string;
    roleLabel?: (role: string) => string;
    /** Its accessible name, when no visible label wraps it. */
    label?: string;
}): import("react").JSX.Element;
