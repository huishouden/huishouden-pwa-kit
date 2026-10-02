import { afterEach, describe, expect, test } from 'bun:test';
import { PHOTO_MAX_CHARS, PhotoError, fitPhoto, isPhotoDataUrl, squareCrop, squarePhoto, type Encode, type PhotoType } from '../src/photo';

/** A stand-in encoder whose output grows with size and quality, like a real one. */
function fakeEncoder({ webp = true, bytesPerPixel = 1 }: { webp?: boolean; bytesPerPixel?: number } = {}) {
  const calls: [number, PhotoType, number][] = [];
  const encode: Encode = async (size, type, quality) => {
    calls.push([size, type, quality]);
    if (type === 'image/webp' && !webp) return null;
    const chars = Math.round(size * size * quality * bytesPerPixel);
    return `data:${type};base64,${'A'.repeat(chars)}`;
  };
  return { encode, calls };
}

describe('squareCrop', () => {
  test('centres the square on the long side', () => {
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(squareCrop(300, 400)).toEqual({ sx: 0, sy: 50, side: 300 });
    expect(squareCrop(300, 300)).toEqual({ sx: 0, sy: 0, side: 300 });
  });

  test('slides to either end, and no further', () => {
    expect(squareCrop(400, 300, -1)).toEqual({ sx: 0, sy: 0, side: 300 });
    expect(squareCrop(400, 300, 1)).toEqual({ sx: 100, sy: 0, side: 300 });
    expect(squareCrop(300, 400, 5)).toEqual({ sx: 0, sy: 100, side: 300 });
    expect(squareCrop(400, 300, Number.NaN)).toEqual({ sx: 50, sy: 0, side: 300 });
  });
});

describe('fitPhoto', () => {
  test('a small enough photo is WebP at the starting quality, in one encode', async () => {
    const { encode, calls } = fakeEncoder({ bytesPerPixel: 0.5 });
    const r = await fitPhoto(encode, { size: 256, quality: 0.8 });
    expect(r).toMatchObject({ type: 'image/webp', size: 256, quality: 0.8 });
    expect(r.dataUrl.length).toBeLessThanOrEqual(PHOTO_MAX_CHARS);
    expect(calls).toHaveLength(1);
  });

  test('lowers quality before size until it fits', async () => {
    // 256² × q: fits once q ≤ ~0.9 at maxChars 40 000 → 0.6.
    const { encode } = fakeEncoder();
    const r = await fitPhoto(encode, { size: 256, quality: 0.9, maxChars: 40_000 });
    expect(r.size).toBe(256);
    expect(r.quality).toBe(0.6);
    expect(r.dataUrl.length).toBeLessThanOrEqual(40_000);
  });

  test('shrinks the square once quality is at its floor', async () => {
    const { encode } = fakeEncoder({ bytesPerPixel: 4 });
    const r = await fitPhoto(encode, { size: 256 });
    expect(r.size).toBeLessThan(256);
    expect(r.dataUrl.length).toBeLessThanOrEqual(PHOTO_MAX_CHARS);
  });

  test('falls back to JPEG where WebP cannot be encoded', async () => {
    const { encode, calls } = fakeEncoder({ webp: false, bytesPerPixel: 0.5 });
    const r = await fitPhoto(encode);
    expect(r.type).toBe('image/jpeg');
    expect(r.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(calls.map((c) => c[1])).toEqual(['image/webp', 'image/jpeg']);
  });

  test('gives up with words when even the smallest square is too big', async () => {
    const { encode } = fakeEncoder({ bytesPerPixel: 100 });
    const err = await fitPhoto(encode).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoError);
    expect(err.reason).toBe('too-large');
  });

  test('a browser that can encode neither is unsupported', async () => {
    const err = await fitPhoto(async () => null).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoError);
    expect(err.reason).toBe('unsupported');
  });
});

describe('squarePhoto with a stubbed canvas', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { createImageBitmap: g.createImageBitmap, OffscreenCanvas: g.OffscreenCanvas };
  afterEach(() => Object.assign(g, saved));

  function stub({ webp, width = 1200, height = 900 }: { webp: boolean; width?: number; height?: number }) {
    const draws: number[][] = [];
    const bitmapOptions: unknown[] = [];
    let closed = 0;
    g.createImageBitmap = async (_: Blob, options: unknown) => {
      bitmapOptions.push(options);
      return { width, height, close: () => closed++ };
    };
    g.OffscreenCanvas = class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage: (...args: number[]) => draws.push(args.slice(1)), imageSmoothingQuality: 'low' };
      }
      async convertToBlob({ type, quality }: { type: string; quality: number }) {
        // Like Safari: no WebP encoder, so a PNG comes back.
        const out = type === 'image/webp' && !webp ? 'image/png' : type;
        return new Blob([new Uint8Array(Math.round(this.width * this.height * quality * 0.4))], { type: out });
      }
    };
    return { draws, bitmapOptions, closed: () => closed };
  }

  test('WebP, centre-cropped, upright from EXIF, under the limit', async () => {
    const s = stub({ webp: true });
    const r = await squarePhoto(new Blob(['x'], { type: 'image/jpeg' }));
    expect(r.type).toBe('image/webp');
    expect(isPhotoDataUrl(r.dataUrl)).toBe(true);
    expect(r.dataUrl.length).toBeLessThanOrEqual(PHOTO_MAX_CHARS);
    expect(r.source).toEqual({ width: 1200, height: 900 });
    expect(s.bitmapOptions[0]).toEqual({ imageOrientation: 'from-image' });
    expect(s.draws[0]).toEqual([150, 0, 900, 900, 0, 0, r.size, r.size]);
    expect(s.closed()).toBe(1);
  });

  test('JPEG where the canvas hands back a PNG for WebP', async () => {
    stub({ webp: false });
    const r = await squarePhoto(new Blob(['x']));
    expect(r.type).toBe('image/jpeg');
    expect(r.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  test('an unreadable file says so', async () => {
    stub({ webp: true });
    g.createImageBitmap = async () => {
      throw new Error('decode');
    };
    const err = await squarePhoto(new Blob(['not an image'])).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoError);
    expect(err.reason).toBe('unreadable');
  });
});

test('isPhotoDataUrl takes only WebP or JPEG data URLs', () => {
  expect(isPhotoDataUrl('data:image/webp;base64,AAAA')).toBe(true);
  expect(isPhotoDataUrl('data:image/jpeg;base64,AA==')).toBe(true);
  expect(isPhotoDataUrl('data:image/png;base64,AAAA')).toBe(false);
  expect(isPhotoDataUrl('https://example.com/a.webp')).toBe(false);
  expect(isPhotoDataUrl(42)).toBe(false);
});
