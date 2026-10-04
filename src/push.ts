import { collection, doc, getDoc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { arrayRemove, arrayUnion, deleteDoc, setDoc, updateDoc } from './firestore.js';
import { getLang, isLang, kt, onLangChange, type Lang } from './i18n.js';

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
 * Each subscription carries the device's language (`lang`, ./i18n), so the sender shows a
 * reminder's `texts` in it (./reminders). `enablePush` writes it; `syncPushLang` (or
 * `watchPushLang`, running for as long as the app is open) rewrites it when the language changes.
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
  /** The device's language (`en`, `es`, `nl`): which of a reminder's `texts` it is sent. */
  lang?: Lang;
  createdAt: number;
}

export const PUSH_SUBSCRIPTION_FIELDS = ['email', 'app', 'endpoint', 'keys', 'ua', 'lang', 'createdAt'] as const;

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

const MESSAGE_KEYS = {
  'ios-not-installed': 'push.iosNotInstalled',
  'ios-too-old': 'push.iosTooOld',
  'unsupported-browser': 'push.unsupported',
  denied: 'push.denied',
} as const satisfies Record<PushUnsupportedReason, string>;

/** The sentence to show for a reason, in the active language. */
export function pushMessage(reason: PushUnsupportedReason): string {
  return kt(MESSAGE_KEYS[reason]);
}

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
  const no = (reason: PushUnsupportedReason): PushSupport => ({ supported: false, reason, message: pushMessage(reason) });
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
  if (!user.email) throw new Error(kt('feedback.signInFirst'));
  if (!vapidPublicKey) throw new Error(kt('push.notConfigured'));
  const support = pushSupport();
  if (!support.supported) throw new Error(support.message);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? pushMessage('denied') : kt('push.notAllowed'));

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
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error(kt('push.incomplete'));
  const email = user.email.trim().toLowerCase();
  const id = await pushSubscriptionId(email, json.endpoint);
  const data: PushSubscriptionDoc = {
    email,
    app: options.app,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    ua: navigator.userAgent.slice(0, 300),
    lang: getLang(),
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
 * Rewrites the `lang` of this device's stored subscription for the signed-in member when it
 * differs from `lang` (default: the page's language). Only that one field of their own document;
 * nothing when notifications are off here. Resolves to whether it wrote.
 */
export async function syncPushLang(db: Firestore, householdId: string, user: { email: string | null }, lang: Lang = getLang()): Promise<boolean> {
  if (!user.email || !isLang(lang) || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const ref = doc(subscriptionsOf(db, householdId), await pushSubscriptionId(user.email, subscription.endpoint));
  const stored = await getDoc(ref);
  if (!stored.exists() || stored.data().lang === lang) return false;
  await updateDoc(ref, { lang });
  return true;
}

/**
 * Keeps this device's subscription in the page's language: syncs once now and again whenever the
 * language changes (the app bar's menu, another tab). Mount it once in the app's shell, signed in;
 * returns the unsubscribe. Failures are silent: the next change or open tries again.
 */
export function watchPushLang(db: Firestore, householdId: string, user: { email: string | null }): () => void {
  const sync = () => void syncPushLang(db, householdId, user).catch(() => {});
  sync();
  return onLangChange(sync);
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

/**
 * Each member's own notification preferences, on every device they use:
 * `households/{id}/notificationPrefs/{email}`. `muted` lists the apps whose reminders they don't
 * want (["bills"]); the shared sender skips them for that person, whatever the household or the
 * app schedules for everyone else. Only the member reads and writes their own document.
 *
 * Fields match the rules exactly (see NOTIFICATION_PREFS_FIELDS); keep them in step.
 */
export interface NotificationPrefsDoc {
  /** Short names of apps whose reminders this member doesn't get. */
  muted: string[];
  updatedAt: number;
}

export const NOTIFICATION_PREFS = 'notificationPrefs';
export const NOTIFICATION_PREFS_FIELDS = ['muted', 'updatedAt'] as const;

const prefsOf = (db: Firestore, householdId: string, email: string) => doc(db, 'households', householdId, NOTIFICATION_PREFS, email.trim().toLowerCase());

/** The apps a stored preferences document mutes: short names only, without repeats. */
export function mutedApps(data: unknown): string[] {
  const muted = (data as { muted?: unknown } | null | undefined)?.muted;
  return Array.isArray(muted) ? [...new Set(muted.filter((a): a is string => typeof a === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(a)))] : [];
}

/** Follows which apps the member has muted for themselves (none until they mute one). */
export function watchMutedApps(db: Firestore, householdId: string, email: string, onChange: (muted: string[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    prefsOf(db, householdId, email),
    (snap) => onChange(mutedApps(snap.data())),
    (error) => onError?.(error),
  );
}

/** Mutes or unmutes one app's reminders for the member, on all their devices. */
export async function setAppMuted(db: Firestore, householdId: string, email: string, app: string, muted: boolean): Promise<void> {
  if (!email) throw new Error(kt('feedback.signInFirst'));
  await setDoc(prefsOf(db, householdId, email), { muted: muted ? arrayUnion(app) : arrayRemove(app), updatedAt: Date.now() }, { merge: true });
}
