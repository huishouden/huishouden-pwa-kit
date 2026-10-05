/**
 * Photos shared into the app (Gallery → Share → the app; Android and desktop Chrome, with
 * `pwaApp({ shareTarget: { images: true } })`). The service worker (`./share-sw`) keeps them in
 * Cache Storage and sends the app to `?share=image`; `readSharedImages()` takes them out, once.
 * After opening whatever reads them (Scan the label), `clearSharedImages()` tidies the address bar.
 */
/** Same names as `SHARE_SW_CONFIG` in ./share-sw (kept apart: that file runs in Node at build time). */
export declare const SHARE_IMAGE_CACHE = "hh-share-images";
export declare const SHARED_IMAGE_KEY = "hh-shared-image";
export declare const SHARED_IMAGE_PARAM: {
    readonly share: "image";
};
/** True when the address says photos were just shared in. */
export declare function hasSharedImages(location?: {
    search: string;
}): boolean;
/**
 * The photos waiting from a share, oldest first, or `null` when the address is not a photo share.
 * An empty list means a share arrived but held nothing the app could read. Called twice in the same
 * page it gives the same answer (StrictMode, two components).
 */
export declare function readSharedImages(location?: {
    search: string;
}): Promise<File[] | null>;
/** Takes `?share=image` off the address bar without reloading. */
export declare function clearSharedImages(): void;
/** Forgets the answer, for tests. */
export declare function resetSharedImagesForTests(): void;
