import { type Contact, type ContactInput } from '../contacts';
import { type ParsedPlace } from '../places';
export interface ContactDialogProps {
    contact: Contact | null;
    /** The app's id in `apps` ("baby"): a new contact shows there, an edited one keeps showing there. */
    app: string;
    /** Roles offered as one-tap chips; any other role can be typed. */
    roles: readonly string[];
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
export declare function ContactDialog({ contact, app, roles, role: initialRole, title, searchPlaceholder, namePlaceholder, prefill, readScreenshot, canMarkPrivate, onSave, onDelete, onClose, }: ContactDialogProps): import("react").JSX.Element;
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
