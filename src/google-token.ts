import { GoogleAuthProvider, reauthenticateWithPopup, type Auth } from 'firebase/auth';

/**
 * Google API access tokens for the signed-in member, in the browser, with their own consent. The
 * first time a set of scopes is needed, Google confirms the account in a popup with those scopes
 * added (browsers only allow that popup from a tap). The token lasts an hour; it is kept and reused
 * for any later request it covers, so calendar search, an invite email and a Gmail check each ask
 * once rather than every time.
 *
 * Kept in memory by default. `persist: true` keeps it in localStorage for its hour, so reopening the
 * app (the wall tablet, a phone) can use it again without a popup; `cachedGoogleToken` reads it
 * without asking anyone.
 */

interface Entry {
  uid: string;
  scopes: string[];
  token: string;
  expires: number;
}

const STORE_KEY = 'hh-google-tokens';
/** Google access tokens last an hour; stop using one a little early. */
const LIFETIME_MS = 55 * 60_000;

let memory: Entry[] = [];

function stored(): Entry[] {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? '[]') as Entry[];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.token === 'string' && Array.isArray(e.scopes)) : [];
  } catch {
    return [];
  }
}

function writeStored(list: Entry[]): void {
  try {
    if (list.length) globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(list));
    else globalThis.localStorage?.removeItem(STORE_KEY);
  } catch {
    // Storage full or unavailable (private mode): the memory copy still works for this session.
  }
}

const sameScopes = (a: Entry, b: Entry) => a.scopes.length === b.scopes.length && a.scopes.every((s) => b.scopes.includes(s));

const covers = (e: Entry, uid: string, scopes: readonly string[], now: number) => e.uid === uid && e.expires > now && scopes.every((s) => e.scopes.includes(s));

/** A still-valid token covering `scopes` for the signed-in member, without asking anyone; null when there is none. */
export function cachedGoogleToken(auth: Auth, scopes: readonly string[]): string | null {
  const user = auth.currentUser;
  if (!user) return null;
  const now = Date.now();
  memory = memory.filter((e) => e.expires > now);
  const hit = memory.find((e) => covers(e, user.uid, scopes, now)) ?? stored().find((e) => covers(e, user.uid, scopes, now));
  return hit?.token ?? null;
}

export interface GoogleTokenOptions {
  /** Keep the token in localStorage for its hour (default: memory only). */
  persist?: boolean;
  /** The error message when Google gives no token, e.g. "Google did not grant calendar access." */
  deniedMessage?: string;
}

/**
 * A token covering `scopes`: the cached one when there is one, otherwise from Google's popup. Call
 * from a tap the first time. Rejects with Firebase's `auth/popup-*` errors when the popup is
 * closed or blocked (see `popupCancelled` / `popupBlocked` in `./feedback`).
 */
export async function googleAccessToken(auth: Auth, scopes: readonly string[], { persist = false, deniedMessage = 'Google did not grant access.' }: GoogleTokenOptions = {}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const cached = cachedGoogleToken(auth, scopes);
  if (cached) return cached;
  const provider = new GoogleAuthProvider();
  for (const scope of scopes) provider.addScope(scope);
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  const result = await reauthenticateWithPopup(user, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error(deniedMessage);
  const entry: Entry = { uid: user.uid, scopes: [...scopes], token, expires: Date.now() + LIFETIME_MS };
  const replaced = (e: Entry) => e.expires <= Date.now() || (e.uid === entry.uid && sameScopes(e, entry));
  memory = [...memory.filter((e) => !replaced(e)), entry];
  if (persist) writeStored([...stored().filter((e) => !replaced(e)), entry]);
  return token;
}

/**
 * Stops using a token: pass the one Google rejected (a 401: revoked, or expired early) so the next
 * call asks again, or nothing to forget every token (signing out).
 */
export function forgetGoogleToken(token?: string): void {
  memory = token ? memory.filter((e) => e.token !== token) : [];
  writeStored(token ? stored().filter((e) => e.token !== token) : []);
}

/** A Google REST API error with its HTTP status. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

/**
 * GET or POST a Google REST API with a token. A 401 forgets the token, so the next attempt asks
 * Google again; any failure throws `GoogleApiError` with Google's own message:
 * "[403] Calendar: Request had insufficient authentication scopes."
 */
export async function googleFetch<T>(token: string, url: string | URL, { label = 'Google', method = 'GET', body }: { label?: string; method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 401) forgetGoogleToken(token);
  if (!res.ok) {
    const answer = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleApiError(`[${res.status}] ${label}: ${answer.error?.message ?? res.statusText}`, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}
