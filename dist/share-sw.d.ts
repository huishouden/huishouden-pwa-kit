/**
 * Service-worker side of the share target for contact cards and images (a shared photo is kept
 * the same way and the app is sent to `?share=image`, where `readSharedImages()` in
 * `./shared-images` reads it). `pwaApp({ shareTarget: { contacts:
 * true } })` adds this to the generated service worker (as `hh-share-sw.js`, loaded with Workbox's
 * importScripts). A file share arrives as a POST, which only a service worker can receive: it keeps
 * the card in Cache Storage and sends the app to `?share=contact`, where `readSharedContact()`
 * (`./vcard`) reads it. A shared place or link (no card) goes on to the app as
 * `?share_title=…&share_text=…&share_url=…`, the same address the GET share target uses, so
 * `readSharedPlace` keeps working.
 *
 * `installShareHandlers` is serialised with `toString()` into that file, so it must stay
 * self-contained: no imports, no references to anything outside its body.
 */
export interface ShareSwConfig {
    /** The share target's action, relative to the service worker's scope. */
    action: string;
    /** The form field carrying the files. */
    fileField: string;
    /** Form fields for the title, text and link, as the manifest names them. */
    textFields: string[];
    cache: string;
    /** The card's key in `cache`, relative to the scope. */
    key: string;
    /** Where shared images wait (a cache of their own, so a card never meets a photo). */
    imageCache: string;
    /** Image `n` is kept under `${imageKey}-${n}`, relative to the scope. */
    imageKey: string;
    /** The form field carrying shared images. */
    imageField: string;
}
export declare function installShareHandlers(sw: any, config: ShareSwConfig): void;
/** The form field a shared contact file arrives in. */
export declare const SHARE_FILE_FIELD = "contact";
/** The form field a shared image arrives in. */
export declare const SHARE_IMAGE_FIELD = "image";
/** The POST share target's action, relative to the manifest (and so to the app's scope). */
export declare const SHARE_ACTION = "share-target";
/** Same names as `SHARE_CACHE` and `SHARED_CONTACT_KEY` in ./vcard, and `SHARE_IMAGE_CACHE` and `SHARED_IMAGE_KEY` in ./shared-images (kept apart: this file runs in Node at build time). */
export declare const SHARE_SW_CONFIG: ShareSwConfig;
/** The file `pwaApp({ shareTarget: { contacts: true } })` writes next to the service worker. */
export declare function shareServiceWorkerSource(): string;
export declare const SHARE_SW_FILE = "hh-share-sw.js";
