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
        event.waitUntil(sw.registration.showNotification(title, {
            body: typeof data.body === 'string' ? data.body : '',
            tag: typeof data.tag === 'string' ? data.tag : undefined,
            icon: typeof data.icon === 'string' ? data.icon : '/pwa-192.png',
            badge: '/pwa-192.png',
            data: { url: typeof data.url === 'string' ? data.url : '/' },
        }));
    });
    sw.addEventListener('notificationclick', (event) => {
        event.notification.close();
        const target = new URL((event.notification.data && event.notification.data.url) || '/', sw.location.origin);
        event.waitUntil((async () => {
            const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
            // An open window of the same app is reused: focused and moved to the deep link.
            const open = windows.find((w) => new URL(w.url).origin === target.origin);
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
