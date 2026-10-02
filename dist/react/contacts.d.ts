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
    onSave: (input: ContactInput) => void;
    onDelete?: () => void;
    onClose: () => void;
}
export declare function ContactDialog({ contact, app, roles, role: initialRole, title, searchPlaceholder, namePlaceholder, prefill, readScreenshot, onSave, onDelete, onClose, }: ContactDialogProps): import("react").JSX.Element;
/** One contact: role, name, edit and delete, then tap-to-call, email, website, address with a map link, and notes. */
export declare function ContactCard({ contact: c, role, onEdit, onDelete }: {
    contact: Contact;
    role: string;
    onEdit: () => void;
    onDelete: () => void;
}): import("react").JSX.Element;
