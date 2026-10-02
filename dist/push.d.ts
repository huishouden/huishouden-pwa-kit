import { type Firestore } from 'firebase/firestore';
/**
 * Push notifications for reminders, with the browser's own Web Push (VAPID; no Firebase Cloud
 * Messaging). `enablePush` asks permission, subscribes through the app's service worker and
 * stores the subscription in `households/{id}/pushSubscriptions/{id}`; the shared sender
 * (huishouden/notify) reads them with a service account and delivers due reminders. Members can
 * only see and delete their own subscriptions.
 *
 * The service worker side comes from `pwaApp({ push: true })`. The VAPID public key is public:
 * apps get it from the `VITE_VAPID_PUBLIC_KEY` repo variable.
 *
 * iPhone and iPad: push works only in an app added to the Home Screen, on iOS/iPadOS 16.4 or
 * later; `pushSupport()` says so, so the app can explain instead of showing a dead button.
 *
 * Fields match the rules exactly (see PUSH_SUBSCRIPTION_FIELDS); keep them in step.
 */
export interface PushSubscriptionDoc {
    email: string;
    /** Short name of the app whose service worker holds the subscription. */
    app: string;
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    ua?: string;
    createdAt: number;
}
export declare const PUSH_SUBSCRIPTION_FIELDS: readonly ["email", "app", "endpoint", "keys", "ua", "createdAt"];
export type PushUnsupportedReason = 
/** iPhone/iPad in a browser tab: add the app to the Home Screen first. */
'ios-not-installed'
/** iPhone/iPad older than 16.4. */
 | 'ios-too-old'
/** No service worker, PushManager or Notification API (old browser, private mode, http). */
 | 'unsupported-browser'
/** The person blocked notifications for this site; only they can undo it, in site settings. */
 | 'denied';
export type PushSupport = {
    supported: true;
} | {
    supported: false;
    reason: PushUnsupportedReason;
    message: string;
};
interface Env {
    userAgent: string;
    maxTouchPoints: number;
    standalone: boolean;
    hasServiceWorker: boolean;
    hasPushManager: boolean;
    permission: NotificationPermission | 'unavailable';
}
/** iOS/iPadOS version from the user agent, or null if not iOS. iPadOS reports itself as a Mac with touch. */
export declare function iosVersion(userAgent: string, maxTouchPoints?: number): number | null;
/** Whether this device can get reminders as notifications, and if not, why (with a sentence to show). */
export declare function pushSupport(env?: Env): PushSupport;
/** VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
export declare function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer>;
/**
 * The subscription's document id: a hash of email and endpoint, so a shared tablet can hold a
 * subscription for each person signed in on it, and re-enabling overwrites instead of adding.
 */
export declare function pushSubscriptionId(email: string, endpoint: string): Promise<string>;
export interface EnablePushOptions {
    /** Short name of this app ("pet"): reminders from it are sent to this subscription first. */
    app: string;
}
/**
 * Turns on reminders as notifications on this device for the signed-in member. Call it from a
 * button tap (browsers only ask for permission in response to one). Throws with a sentence to
 * show when the device can't, or the person said no.
 */
export declare function enablePush(db: Firestore, householdId: string, user: {
    email: string | null;
}, vapidPublicKey: string, options: EnablePushOptions): Promise<{
    id: string;
    endpoint: string;
}>;
/** Whether this device gets the signed-in member's notifications: subscribed, and their subscription is stored. */
export declare function pushEnabled(db: Firestore, householdId: string, user: {
    email: string | null;
}): Promise<boolean>;
/**
 * Turns notifications off on this device for the signed-in member by deleting their stored
 * subscription. The browser's subscription stays, because on a shared tablet another member's
 * notifications use the same one; pass `unsubscribeDevice: true` to drop it too.
 */
export declare function disablePush(db: Firestore, householdId: string, user: {
    email: string | null;
}, { unsubscribeDevice }?: {
    unsubscribeDevice?: boolean;
}): Promise<void>;
export {};
