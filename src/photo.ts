// Small square photos for avatars (a pet, a person, a car), kept as a data URL in a Firestore
// document instead of Cloud Storage, so it works on the free plan. Not for galleries: one photo is
// cropped square, shrunk and compressed until it fits well under Firestore's 1 MiB document limit.

import { kt } from './i18n.js';

/** The longest data URL `squarePhoto` returns by default: about 60 KB, a few hundred ms to sync. */
export const PHOTO_MAX_CHARS = 60_000;

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
  source: { width: number; height: number };
}

export class PhotoError extends Error {
  constructor(
    message: string,
    readonly reason: 'unreadable' | 'too-large' | 'unsupported',
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

/**
 * Opens the device's file chooser for one image (on phones it offers the camera too). Resolves with
 * the file, or null when the person closes it without choosing. Call it from a tap.
 */
export function pickPhoto(options: { capture?: 'user' | 'environment' } = {}): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (options.capture) input.setAttribute('capture', options.capture);
    input.style.display = 'none';
    let done = false;
    const finish = (file: File | null) => {
      if (done) return;
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
export function squareCrop(width: number, height: number, position = 0): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  const p = Math.max(-1, Math.min(1, Number.isFinite(position) ? position : 0));
  const slack = (width - side) / 2 || (height - side) / 2;
  const offset = Math.round(slack + p * slack);
  return width >= height ? { sx: offset, sy: 0, side } : { sx: 0, sy: offset, side };
}

/** An encoder for one attempt: the drawn square at `size`, as `type` at `quality`; null when the browser can't. */
export type Encode = (size: number, type: PhotoType, quality: number) => Promise<string | null>;

const QUALITY_FLOOR = 0.45;
const SIZE_FLOOR = 96;

/**
 * The fitting loop, apart from any canvas: WebP first (falling back to JPEG when the browser can't
 * encode WebP), lowering quality, then size, until the data URL is at most `maxChars`.
 */
export async function fitPhoto(encode: Encode, options: SquarePhotoOptions = {}): Promise<Omit<SquarePhoto, 'source'>> {
  const maxChars = options.maxChars ?? PHOTO_MAX_CHARS;
  let size = Math.max(SIZE_FLOOR, Math.round(options.size ?? 256));
  const start = Math.min(1, Math.max(QUALITY_FLOOR, options.quality ?? 0.82));
  let type: PhotoType = 'image/webp';
  // The first WebP attempt doubles as the check for whether the browser can encode WebP at all.
  let first = await encode(size, type, start);
  if (first === null) type = 'image/jpeg';
  for (;;) {
    for (let quality = start; quality >= QUALITY_FLOOR - 1e-9; quality = Math.round((quality - 0.1) * 100) / 100) {
      const dataUrl = first ?? (await encode(size, type, quality));
      first = null;
      if (dataUrl === null) throw new PhotoError(kt('photo.cantShrink'), 'unsupported');
      if (dataUrl.length <= maxChars) return { dataUrl, type, size, quality };
    }
    if (size <= SIZE_FLOOR) throw new PhotoError(kt('photo.tooDetailed'), 'too-large');
    size = Math.max(SIZE_FLOOR, Math.round(size * 0.75));
  }
}

interface Surface {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  toBlob(type: string, quality: number): Promise<Blob | null>;
}

function surface(size: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size);
    return { canvas, toBlob: (type, quality) => canvas.convertToBlob({ type, quality }).catch(() => null) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, toBlob: (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)) };
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/**
 * A photo cropped square (centred, or slid by `position`), turned upright from its EXIF orientation,
 * shrunk to `size` and encoded as WebP (JPEG where the browser can't encode WebP), lowering quality
 * and then size until the data URL is at most `maxChars`. Throws a `PhotoError` with words to show.
 */
export async function squarePhoto(file: Blob, options: SquarePhotoOptions = {}): Promise<SquarePhoto> {
  if (typeof createImageBitmap !== 'function') throw new PhotoError(kt('photo.cantRead'), 'unsupported');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError(kt('photo.unreadable'), 'unreadable');
  }
  const source = { width: bitmap.width, height: bitmap.height };
  const crop = squareCrop(bitmap.width, bitmap.height, options.position);
  try {
    const fitted = await fitPhoto(async (size, type, quality) => {
      const s = surface(size);
      const ctx = s.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, size, size);
      const blob = await s.toBlob(type, quality);
      // A browser that can't encode the type hands back a PNG instead.
      if (!blob || blob.type !== type) return null;
      return toDataUrl(blob);
    }, options);
    return { ...fitted, source };
  } finally {
    bitmap.close();
  }
}

/** Whether a stored value is a photo this module made (a WebP or JPEG data URL). */
export function isPhotoDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value);
}
