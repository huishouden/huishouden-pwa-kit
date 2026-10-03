/**
 * Service-worker side of push notifications. `pwaApp({ push: true })` adds this to the app's
 * generated service worker (as `hh-push-sw.js`, loaded with Workbox's importScripts), so an app
 * needs no service-worker code of its own.
 *
 * `installPushHandlers` is serialised with `toString()` into that file, so it must stay
 * self-contained: no imports, no references to anything outside its body.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function installPushHandlers(sw) {
    sw.addEventListener('push', (event) => {
        let data = {};
        try {
            data = event.data ? event.data.json() : {};
        }
        catch {
            data = { body: event.data ? event.data.text() : '' };
        }
        const title = typeof data.title === 'string' && data.title ? data.title : 'Reminder';
        // The worker's scope is the app's path on the shared site (/pet/), so its icons and home are there.
        const scope = sw.registration.scope || sw.location.origin + '/';
        event.waitUntil(sw.registration.showNotification(title, {
            body: typeof data.body === 'string' ? data.body : '',
            tag: typeof data.tag === 'string' ? data.tag : undefined,
            icon: typeof data.icon === 'string' ? data.icon : scope + 'pwa-192.png',
            badge: scope + 'pwa-192.png',
            data: { url: typeof data.url === 'string' ? data.url : scope },
        }));
    });
    sw.addEventListener('notificationclick', (event) => {
        event.notification.close();
        const scope = sw.registration.scope || sw.location.origin + '/';
        const target = new URL((event.notification.data && event.notification.data.url) || scope, scope);
        event.waitUntil((async () => {
            const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
            // An open window of the same app is reused: focused and moved to the deep link. Every app
            // shares one origin (pwa-kit docs/one-site.md), so "the same app" is a window under the
            // link's app path: this worker's scope, or the link's first folder for another app's link.
            const folder = /^\/[^/]+\//.exec(target.pathname);
            const home = target.href.startsWith(scope) ? scope : folder ? target.origin + folder[0] : null;
            const open = home ? windows.find((w) => w.url.startsWith(home)) : undefined;
            if (open) {
                await open.focus();
                if (open.url !== target.href && typeof open.navigate === 'function')
                    await open.navigate(target.href).catch(() => { });
                return;
            }
            await sw.clients.openWindow(target.href);
        })());
    });
}
/** The file `pwaApp({ push: true })` writes next to the service worker. */
export function pushServiceWorkerSource() {
    return `// Huishouden push notifications (@huishouden/pwa-kit/push)\n(${installPushHandlers.toString()})(self);\n`;
}
export const PUSH_SW_FILE = 'hh-push-sw.js';
