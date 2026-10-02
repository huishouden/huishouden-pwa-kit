/**
 * On-device text recognition for photos and screenshots: open-source OCR (tesseract.js, English),
 * nothing uploaded or stored. Used by the medicine-label reader (`./dose` `readLabel`) and the
 * business-listing reader (`./places` `readPlaceScreenshot`); one engine is shared between them.
 *
 * Where the engine's files come from: tesseract.js itself (`TESSERACT_URL`), its worker and its
 * WebAssembly core from jsDelivr at a pinned version, and the English language data from the pinned
 * package below (about 2 MB, gzipped). Nothing is bundled into the app, so an app needs no
 * dependency for it and downloads nothing until someone reads an image. The language data is kept in IndexedDB after the
 * first read; with `pwaApp({ ocr: true })` the service worker also caches the worker and core, so
 * reading works offline after the first use. To self-host instead, copy the files into the app's
 * `public/` and pass their paths as `{ paths }`.
 */
export const OCR_LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
/** The tesseract.js release used; kept equal to the kit's devDependency (a test checks). */
export const TESSERACT_VERSION = '7.0.0';
export const TESSERACT_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.esm.min.js`;
let worker = null;
let progressListener;
/**
 * The text in an image, read on the device. The engine is loaded on first use only, so apps that
 * never call this don't download it.
 */
export async function readImageText(image, options = {}) {
    progressListener = options.onProgress;
    if (!worker) {
        worker = (async () => {
            const { enginePath = TESSERACT_URL, ...paths } = options.paths ?? {};
            // Loaded from its URL rather than bundled, so apps that never read images carry none of it.
            const engine = await import(/* @vite-ignore */ enginePath);
            const { createWorker } = (engine.default ?? engine);
            return (await createWorker('eng', 1, {
                langPath: OCR_LANG_PATH,
                ...paths,
                logger: (m) => progressListener?.(m.progress, m.status),
            }));
        })();
        worker.catch(() => (worker = null));
    }
    const ocr = await worker;
    const prepared = options.screenshot ? await prepareScreenshot(image, options.maxSide ?? 2800) : await downscale(image, options.maxSide ?? 2000);
    const { data } = await ocr.recognize(prepared);
    return data.text;
}
/** Stops the OCR engine and frees its memory; the next read starts it again. */
export async function releaseOcr() {
    const w = worker;
    worker = null;
    if (w)
        await (await w).terminate().catch(() => { });
}
const canDraw = () => typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined';
async function downscale(image, maxSide) {
    if (!canDraw())
        return image;
    const bitmap = await createImageBitmap(image);
    const scale = maxSide / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1) {
        bitmap.close();
        return image;
    }
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.convertToBlob({ type: 'image/png' });
}
/** Where to cut and how far to scale a screenshot of `width` × `height` (pure, for tests). */
export function screenshotFrame(width, height, maxSide = 2800) {
    // A phone screen is at least 1.6 times taller than wide; its top ~5% is the clock and battery.
    const top = height / width >= 1.6 ? Math.round(height * 0.05) : 0;
    const h = height - top;
    // Text on a 1x screenshot is too small to read; 2x/3x screens are about 1080+ px wide already.
    const scale = Math.min(Math.max(1, 1080 / width), maxSide / Math.max(width, h));
    return { top, height: h, scale };
}
async function prepareScreenshot(image, maxSide) {
    if (!canDraw())
        return image;
    const bitmap = await createImageBitmap(image);
    const frame = screenshotFrame(bitmap.width, bitmap.height, maxSide);
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * frame.scale), Math.round(frame.height * frame.scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, frame.top, bitmap.width, frame.height, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    toReadableGray(pixels.data);
    ctx.putImageData(pixels, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
}
/** Greyscale in place, inverted when the image is mostly dark (dark mode), so text is dark on light. */
export function toReadableGray(rgba) {
    let sum = 0;
    for (let i = 0; i < rgba.length; i += 4) {
        const y = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        rgba[i] = rgba[i + 1] = rgba[i + 2] = y;
        sum += y;
    }
    if (sum / (rgba.length / 4) >= 110)
        return;
    for (let i = 0; i < rgba.length; i += 4)
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 255 - rgba[i];
}
