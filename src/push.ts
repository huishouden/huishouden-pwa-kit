import { collection, doc, getDoc, type Firestore } from 'firebase/firestore';
import { deleteDoc, setDoc } from './firestore.js';

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
  keys: { p256dh: string; auth: string };
  ua?: string;
  createdAt: number;
}

export const PUSH_SUBSCRIPTION_FIELDS = ['email', 'app', 'endpoint', 'keys', 'ua', 'createdAt'] as const;

export type PushUnsupportedReason =
  /** iPhone/iPad in a browser tab: add the app to the Home Screen first. */
  | 'ios-not-installed'
  /** iPhone/iPad older than 16.4. */
  | 'ios-too-old'
  /** No service worker, PushManager or Notification API (old browser, private mode, http). */
  | 'unsupported-browser'
  /** The person blocked notifications for this site; only they can undo it, in site settings. */
  | 'denied';

export type PushSupport = { supported: true } | { supported: false; reason: PushUnsupportedReason; message: string };

const MESSAGES: Record<PushUnsupportedReason, string> = {
  'ios-not-installed': 'On iPhone and iPad, notifications work once the app is on the Home Screen: tap Share, then "Add to Home Screen", and open it from there.',
  'ios-too-old': 'Notifications need iOS or iPadOS 16.4 or later.',
  'unsupported-browser': "This browser can't show notifications from web apps.",
  denied: 'Notifications are blocked for this app. Allow them in the browser or system settings for this site.',
};

interface Env {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | 'unavailable';
}

function currentEnv(): Env {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone: Boolean(
      (nav as { standalone?: boolean } | undefined)?.standalone || win?.matchMedia?.('(display-mode: standalone)').matches,
    ),
    hasServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    hasPushManager: Boolean(win && 'PushManager' in win),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unavailable',
  };
}

/** iOS/iPadOS version from the user agent, or null if not iOS. iPadOS reports itself as a Mac with touch. */
export function iosVersion(userAgent: string, maxTouchPoints = 0): number | null {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!ios) return null;
  const m = userAgent.match(/OS (\d+)[_.](\d+)/) ?? userAgent.match(/Version\/(\d+)\.(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : 0;
}

/** Whether this device can get reminders as notifications, and if not, why (with a sentence to show). */
export function pushSupport(env: Env = currentEnv()): PushSupport {
  const no = (reason: PushUnsupportedReason): PushSupport => ({ supported: false, reason, message: MESSAGES[reason] });
  const ios = iosVersion(env.userAgent, env.maxTouchPoints);
  if (ios !== null) {
    if (ios > 0 && ios < 16.04) return no('ios-too-old');
    if (!env.standalone) return no('ios-not-installed');
  }
  if (!env.hasServiceWorker || !env.hasPushManager || env.permission === 'unavailable') return no('unsupported-browser');
  if (env.permission === 'denied') return no('denied');
  return { supported: true };
}

/** VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The subscription's document id: a hash of email and endpoint, so a shared tablet can hold a
 * subscription for each person signed in on it, and re-enabling overwrites instead of adding.
 */
export async function pushSubscriptionId(email: string, endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${email.trim().toLowerCase()}\n${endpoint}`));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const subscriptionsOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, 'pushSubscriptions');

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export interface EnablePushOptions {
  /** Short name of this app ("pet"): reminders from it are sent to this subscription first. */
  app: string;
}

/**
 * Turns on reminders as notifications on this device for the signed-in member. Call it from a
 * button tap (browsers only ask for permission in response to one). Throws with a sentence to
 * show when the device can't, or the person said no.
 */
export async function enablePush(
  db: Firestore,
  householdId: string,
  user: { email: string | null },
  vapidPublicKey: string,
  options: EnablePushOptions,
): Promise<{ id: string; endpoint: string }> {
  if (!user.email) throw new Error('Sign in first.');
  if (!vapidPublicKey) throw new Error('Notifications are not set up for this app (VITE_VAPID_PUBLIC_KEY is empty).');
  const support = pushSupport();
  if (!support.supported) throw new Error(support.message);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? MESSAGES.denied : 'Notifications were not allowed.');

  const registration = await navigator.serviceWorker.ready;
  const key = applicationServerKey(vapidPublicKey);
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with another key can't receive this sender's pushes.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('The browser returned an incomplete push subscription.');
  const email = user.email.trim().toLowerCase();
  const id = await pushSubscriptionId(email, json.endpoint);
  const data: PushSubscriptionDoc = {
    email,
    app: options.app,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    ua: navigator.userAgent.slice(0, 300),
    createdAt: Date.now(),
  };
  await setDoc(doc(subscriptionsOf(db, householdId), id), data);
  return { id, endpoint: json.endpoint };
}

/** Whether this device gets the signed-in member's notifications: subscribed, and their subscription is stored. */
export async function pushEnabled(db: Firestore, householdId: string, user: { email: string | null }): Promise<boolean> {
  if (!user.email || !pushSupport().supported || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const stored = await getDoc(doc(subscriptionsOf(db, householdId), await pushSubscriptionId(user.email, subscription.endpoint)));
  return stored.exists();
}

/**
 * Turns notifications off on this device for the signed-in member by deleting their stored
 * subscription. The browser's subscription stays, because on a shared tablet another member's
 * notifications use the same one; pass `unsubscribeDevice: true` to drop it too.
 */
export async function disablePush(
  db: Firestore,
  householdId: string,
  user: { email: string | null },
  { unsubscribeDevice = false }: { unsubscribeDevice?: boolean } = {},
): Promise<void> {
  if (!user.email || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await deleteDoc(doc(subscriptionsOf(db, householdId), await pushSubscriptionId(user.email, subscription.endpoint)));
  if (unsubscribeDevice) await subscription.unsubscribe();
}
