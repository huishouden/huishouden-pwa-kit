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

/* eslint-disable @typescript-eslint/no-explicit-any */
export function installShareHandlers(sw: any, config: ShareSwConfig): void {
  sw.addEventListener('fetch', (event: any) => {
    const request = event.request;
    if (request.method !== 'POST') return;
    // A share from another site's page is not a share from the share sheet (which arrives as 'none').
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return;
    const scope = new URL(sw.registration.scope);
    const url = new URL(request.url);
    if (url.origin !== scope.origin || url.pathname !== new URL(config.action, scope).pathname) return;
    event.respondWith(
      (async () => {
        let form: any;
        try {
          form = await request.formData();
        } catch {
          return Response.redirect(scope.href, 303);
        }
        let cards = '';
        const images: any[] = [];
        // At most 10 files of 10 MB each: more is not a share, and the cache is shared with the app's own.
        const files = [...form.getAll(config.fileField), ...form.getAll(config.imageField)].slice(0, 10);
        for (const file of files) {
          if (typeof file === 'string' || file.size > 10 * 1024 * 1024) continue;
          if (/^image\//i.test(file.type)) {
            images.push(file);
            continue;
          }
          const text = await file.text();
          if (/BEGIN:VCARD/i.test(text)) cards += `${text.trim()}\r\n`;
        }
        if (images.length && !cards) {
          const store = await sw.caches.open(config.imageCache);
          for (const [n, image] of images.entries()) {
            await store.put(new URL(`${config.imageKey}-${n}`, scope).href, new Response(image, { headers: { 'Content-Type': image.type, 'X-File-Name': encodeURIComponent(image.name || `photo-${n}`) } }));
          }
          const target = new URL(scope.href);
          target.searchParams.set('share', 'image');
          return Response.redirect(target.href, 303);
        }
        // Some apps share a card as text rather than a file.
        const sharedText = config.textFields.map((f) => form.get(f)).find((v: unknown) => typeof v === 'string' && /BEGIN:VCARD/i.test(v));
        if (!cards && sharedText) cards = sharedText;
        if (cards) {
          const cache = await sw.caches.open(config.cache);
          await cache.put(new URL(config.key, scope).href, new Response(cards, { headers: { 'Content-Type': 'text/vcard; charset=utf-8' } }));
          const target = new URL(scope.href);
          target.searchParams.set('share', 'contact');
          return Response.redirect(target.href, 303);
        }
        const target = new URL(scope.href);
        for (const field of config.textFields) {
          const value = form.get(field);
          if (typeof value === 'string' && value.trim()) target.searchParams.set(field, value);
        }
        return Response.redirect(target.href, 303);
      })(),
    );
  });
}

/** The form field a shared contact file arrives in. */
export const SHARE_FILE_FIELD = 'contact';
/** The form field a shared image arrives in. */
export const SHARE_IMAGE_FIELD = 'image';
/** The POST share target's action, relative to the manifest (and so to the app's scope). */
export const SHARE_ACTION = 'share-target';
/** Same names as `SHARE_CACHE` and `SHARED_CONTACT_KEY` in ./vcard, and `SHARE_IMAGE_CACHE` and `SHARED_IMAGE_KEY` in ./shared-images (kept apart: this file runs in Node at build time). */
export const SHARE_SW_CONFIG: ShareSwConfig = {
  action: SHARE_ACTION,
  fileField: SHARE_FILE_FIELD,
  textFields: ['share_title', 'share_text', 'share_url'],
  cache: 'hh-share',
  key: 'hh-shared-contact',
  imageCache: 'hh-share-images',
  imageKey: 'hh-shared-image',
  imageField: SHARE_IMAGE_FIELD,
};

/** The file `pwaApp({ shareTarget: { contacts: true } })` writes next to the service worker. */
export function shareServiceWorkerSource(): string {
  return `// Huishouden share target for contact cards (@huishouden/pwa-kit/contacts)\n(${installShareHandlers.toString()})(self, ${JSON.stringify(SHARE_SW_CONFIG)});\n`;
}

export const SHARE_SW_FILE = 'hh-share-sw.js';
