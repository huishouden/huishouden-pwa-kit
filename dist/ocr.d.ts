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
export declare const OCR_LANG_PATH = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int";
/** The tesseract.js release used; kept equal to the kit's devDependency (a test checks). */
export declare const TESSERACT_VERSION = "7.0.0";
export declare const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js";
export interface ReadTextOptions {
    /** Self-hosted engine files: `enginePath` (tesseract.esm.min.js), `workerPath`, `corePath`, `langPath` (see OCR_LANG_PATH). */
    paths?: {
        enginePath?: string;
        workerPath?: string;
        corePath?: string;
        langPath?: string;
    };
    /** 0..1 while the engine loads and reads. */
    onProgress?: (progress: number, status: string) => void;
    /** Longest side the image is scaled down to before reading (phone photos are slow at full size). Default 2000. */
    maxSide?: number;
    /**
     * Prepares a phone screenshot: drops the status bar of a tall image, scales small text up, and
     * turns a dark-mode screen into dark text on light, which the engine reads far better.
     */
    screenshot?: boolean;
}
/**
 * The text in an image, read on the device. The engine is loaded on first use only, so apps that
 * never call this don't download it.
 */
export declare function readImageText(image: Blob, options?: ReadTextOptions): Promise<string>;
/** Stops the OCR engine and frees its memory; the next read starts it again. */
export declare function releaseOcr(): Promise<void>;
/** Where to cut and how far to scale a screenshot of `width` × `height` (pure, for tests). */
export declare function screenshotFrame(width: number, height: number, maxSide?: number): {
    top: number;
    height: number;
    scale: number;
};
/** Greyscale in place, inverted when the image is mostly dark (dark mode), so text is dark on light. */
export declare function toReadableGray(rgba: Uint8ClampedArray): void;
