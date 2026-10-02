/**
 * Service-worker side of push notifications. `pwaApp({ push: true })` adds this to the app's
 * generated service worker (as `hh-push-sw.js`, loaded with Workbox's importScripts), so an app
 * needs no service-worker code of its own.
 *
 * `installPushHandlers` is serialised with `toString()` into that file, so it must stay
 * self-contained: no imports, no references to anything outside its body.
 */
/** What the sender (huishouden/notify) puts in each push. */
export interface PushPayload {
    title: string;
    body?: string;
    /** Opened when the notification is tapped. */
    url?: string;
    /** Replaces an earlier notification with the same tag (the reminder id). */
    tag?: string;
    app?: string;
    icon?: string;
}
export declare function installPushHandlers(sw: any): void;
/** The file `pwaApp({ push: true })` writes next to the service worker. */
export declare function pushServiceWorkerSource(): string;
export declare const PUSH_SW_FILE = "hh-push-sw.js";
