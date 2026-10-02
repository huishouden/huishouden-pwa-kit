/**
 * Choosing a small avatar photo: tap the avatar (or "Choose photo"), pick or take a photo, slide the
 * square along the photo if it isn't square, then Use photo. The result is a data URL from
 * `squarePhoto` in `../photo`, for the app to store in its own document. For avatars, not galleries.
 */
import { type ReactNode } from 'react';
import { type SquarePhotoOptions } from '../photo';
export declare function PhotoPicker({ photo, fallback, label, size, options, onSave, onRemove, pick }: {
    /** The current photo (a data URL), if any. */
    photo?: string | null;
    /** Shown when there is no photo: the app's initial or icon avatar. */
    fallback: ReactNode;
    /** What the photo is of, for buttons: "Biscuit's photo". */
    label: string;
    /** Avatar size on screen, in px. */
    size?: number;
    options?: SquarePhotoOptions;
    onSave: (dataUrl: string) => void;
    onRemove?: () => void;
    /** How a file is chosen; tests pass their own. */
    pick?: () => Promise<Blob | null>;
}): import("react").JSX.Element;
