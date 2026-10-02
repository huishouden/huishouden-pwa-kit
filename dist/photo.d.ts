/** The longest data URL `squarePhoto` returns by default: about 60 KB, a few hundred ms to sync. */
export declare const PHOTO_MAX_CHARS = 60000;
export type PhotoType = 'image/webp' | 'image/jpeg';
export interface SquarePhotoOptions {
    /** Side of the square in pixels. Default 256. */
    size?: number;
    /** Starting encoder quality, 0–1. Default 0.82. */
    quality?: number;
    /** Longest data URL allowed (characters). Default `PHOTO_MAX_CHARS`. */
    maxChars?: number;
    /** Where the square sits along the photo's long side: -1 start (left/top), 0 centre, 1 end. */
    position?: number;
}
export interface SquarePhoto {
    /** `data:image/webp;base64,…` or `data:image/jpeg;base64,…`. */
    dataUrl: string;
    type: PhotoType;
    /** The side it ended up at, after any shrinking to fit. */
    size: number;
    quality: number;
    /** The source's size after EXIF rotation, so a picker knows which way the crop can slide. */
    source: {
        width: number;
        height: number;
    };
}
export declare class PhotoError extends Error {
    readonly reason: 'unreadable' | 'too-large' | 'unsupported';
    constructor(message: string, reason: 'unreadable' | 'too-large' | 'unsupported');
}
/**
 * Opens the device's file chooser for one image (on phones it offers the camera too). Resolves with
 * the file, or null when the person closes it without choosing. Call it from a tap.
 */
export declare function pickPhoto(options?: {
    capture?: 'user' | 'environment';
}): Promise<File | null>;
/** The source rectangle of a centred square crop, slid along the long side by `position` (-1 to 1). */
export declare function squareCrop(width: number, height: number, position?: number): {
    sx: number;
    sy: number;
    side: number;
};
/** An encoder for one attempt: the drawn square at `size`, as `type` at `quality`; null when the browser can't. */
export type Encode = (size: number, type: PhotoType, quality: number) => Promise<string | null>;
/**
 * The fitting loop, apart from any canvas: WebP first (falling back to JPEG when the browser can't
 * encode WebP), lowering quality, then size, until the data URL is at most `maxChars`.
 */
export declare function fitPhoto(encode: Encode, options?: SquarePhotoOptions): Promise<Omit<SquarePhoto, 'source'>>;
/**
 * A photo cropped square (centred, or slid by `position`), turned upright from its EXIF orientation,
 * shrunk to `size` and encoded as WebP (JPEG where the browser can't encode WebP), lowering quality
 * and then size until the data URL is at most `maxChars`. Throws a `PhotoError` with words to show.
 */
export declare function squarePhoto(file: Blob, options?: SquarePhotoOptions): Promise<SquarePhoto>;
/** Whether a stored value is a photo this module made (a WebP or JPEG data URL). */
export declare function isPhotoDataUrl(value: unknown): value is string;
