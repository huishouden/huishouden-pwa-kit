// Small square photos for avatars (a pet, a person, a car), kept as a data URL in a Firestore
// document instead of Cloud Storage, so it works on the free plan. Not for galleries: one photo is
// cropped square, shrunk and compressed until it fits well under Firestore's 1 MiB document limit.
/** The longest data URL `squarePhoto` returns by default: about 60 KB, a few hundred ms to sync. */
export const PHOTO_MAX_CHARS = 60_000;
export class PhotoError extends Error {
    reason;
    constructor(message, reason) {
        super(message);
        this.reason = reason;
        this.name = 'PhotoError';
    }
}
/**
 * Opens the device's file chooser for one image (on phones it offers the camera too). Resolves with
 * the file, or null when the person closes it without choosing. Call it from a tap.
 */
export function pickPhoto(options = {}) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (options.capture)
            input.setAttribute('capture', options.capture);
        input.style.display = 'none';
        let done = false;
        const finish = (file) => {
            if (done)
                return;
            done = true;
            input.remove();
            resolve(file);
        };
        input.addEventListener('change', () => finish(input.files?.[0] ?? null));
        input.addEventListener('cancel', () => finish(null));
        document.body.append(input);
        input.click();
    });
}
/** The source rectangle of a centred square crop, slid along the long side by `position` (-1 to 1). */
export function squareCrop(width, height, position = 0) {
    const side = Math.min(width, height);
    const p = Math.max(-1, Math.min(1, Number.isFinite(position) ? position : 0));
    const slack = (width - side) / 2 || (height - side) / 2;
    const offset = Math.round(slack + p * slack);
    return width >= height ? { sx: offset, sy: 0, side } : { sx: 0, sy: offset, side };
}
const QUALITY_FLOOR = 0.45;
const SIZE_FLOOR = 96;
/**
 * The fitting loop, apart from any canvas: WebP first (falling back to JPEG when the browser can't
 * encode WebP), lowering quality, then size, until the data URL is at most `maxChars`.
 */
export async function fitPhoto(encode, options = {}) {
    const maxChars = options.maxChars ?? PHOTO_MAX_CHARS;
    let size = Math.max(SIZE_FLOOR, Math.round(options.size ?? 256));
    const start = Math.min(1, Math.max(QUALITY_FLOOR, options.quality ?? 0.82));
    let type = 'image/webp';
    // The first WebP attempt doubles as the check for whether the browser can encode WebP at all.
    let first = await encode(size, type, start);
    if (first === null)
        type = 'image/jpeg';
    for (;;) {
        for (let quality = start; quality >= QUALITY_FLOOR - 1e-9; quality = Math.round((quality - 0.1) * 100) / 100) {
            const dataUrl = first ?? (await encode(size, type, quality));
            first = null;
            if (dataUrl === null)
                throw new PhotoError("This browser can't make a photo smaller.", 'unsupported');
            if (dataUrl.length <= maxChars)
                return { dataUrl, type, size, quality };
        }
        if (size <= SIZE_FLOOR)
            throw new PhotoError('That photo is too detailed to make small enough.', 'too-large');
        size = Math.max(SIZE_FLOOR, Math.round(size * 0.75));
    }
}
function surface(size) {
    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(size, size);
        return { canvas, toBlob: (type, quality) => canvas.convertToBlob({ type, quality }).catch(() => null) };
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return { canvas, toBlob: (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)) };
}
async function toDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${blob.type};base64,${btoa(binary)}`;
}
/**
 * A photo cropped square (centred, or slid by `position`), turned upright from its EXIF orientation,
 * shrunk to `size` and encoded as WebP (JPEG where the browser can't encode WebP), lowering quality
 * and then size until the data URL is at most `maxChars`. Throws a `PhotoError` with words to show.
 */
export async function squarePhoto(file, options = {}) {
    if (typeof createImageBitmap !== 'function')
        throw new PhotoError("This browser can't read photos.", 'unsupported');
    let bitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    catch {
        throw new PhotoError("Couldn't read that photo. Try another one.", 'unreadable');
    }
    const source = { width: bitmap.width, height: bitmap.height };
    const crop = squareCrop(bitmap.width, bitmap.height, options.position);
    try {
        const fitted = await fitPhoto(async (size, type, quality) => {
            const s = surface(size);
            const ctx = s.canvas.getContext('2d');
            if (!ctx)
                return null;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, size, size);
            const blob = await s.toBlob(type, quality);
            // A browser that can't encode the type hands back a PNG instead.
            if (!blob || blob.type !== type)
                return null;
            return toDataUrl(blob);
        }, options);
        return { ...fitted, source };
    }
    finally {
        bitmap.close();
    }
}
/** Whether a stored value is a photo this module made (a WebP or JPEG data URL). */
export function isPhotoDataUrl(value) {
    return typeof value === 'string' && /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value);
}
