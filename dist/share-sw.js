/**
 * Service-worker side of the share target for contact cards. `pwaApp({ shareTarget: { contacts:
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
/* eslint-disable @typescript-eslint/no-explicit-any */
export function installShareHandlers(sw, config) {
    sw.addEventListener('fetch', (event) => {
        const request = event.request;
        if (request.method !== 'POST')
            return;
        const scope = new URL(sw.registration.scope);
        const url = new URL(request.url);
        if (url.origin !== scope.origin || url.pathname !== new URL(config.action, scope).pathname)
            return;
        event.respondWith((async () => {
            let form;
            try {
                form = await request.formData();
            }
            catch {
                return Response.redirect(scope.href, 303);
            }
            let cards = '';
            for (const file of form.getAll(config.fileField)) {
                if (typeof file === 'string')
                    continue;
                const text = await file.text();
                if (/BEGIN:VCARD/i.test(text))
                    cards += `${text.trim()}\r\n`;
            }
            // Some apps share a card as text rather than a file.
            const sharedText = config.textFields.map((f) => form.get(f)).find((v) => typeof v === 'string' && /BEGIN:VCARD/i.test(v));
            if (!cards && sharedText)
                cards = sharedText;
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
                if (typeof value === 'string' && value.trim())
                    target.searchParams.set(field, value);
            }
            return Response.redirect(target.href, 303);
        })());
    });
}
/** The form field a shared contact file arrives in. */
export const SHARE_FILE_FIELD = 'contact';
/** The POST share target's action, relative to the manifest (and so to the app's scope). */
export const SHARE_ACTION = 'share-target';
/** Same names as `SHARE_CACHE` and `SHARED_CONTACT_KEY` in ./vcard (kept apart: this file runs in Node at build time). */
export const SHARE_SW_CONFIG = {
    action: SHARE_ACTION,
    fileField: SHARE_FILE_FIELD,
    textFields: ['share_title', 'share_text', 'share_url'],
    cache: 'hh-share',
    key: 'hh-shared-contact',
};
/** The file `pwaApp({ shareTarget: { contacts: true } })` writes next to the service worker. */
export function shareServiceWorkerSource() {
    return `// Huishouden share target for contact cards (@huishouden/pwa-kit/contacts)\n(${installShareHandlers.toString()})(self, ${JSON.stringify(SHARE_SW_CONFIG)});\n`;
}
export const SHARE_SW_FILE = 'hh-share-sw.js';
