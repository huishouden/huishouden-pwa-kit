import type { Auth } from 'firebase/auth';
import { loadGsi, loadedGsi, type GsiCodeResponse, type GsiTokenResponse } from './gsi';
import { reportError } from './observability';
import { kt } from './i18n.js';

/**
 * Google API access tokens (Calendar, Gmail, Sheets) for the signed-in member, with their own
 * consent, from Google Identity Services' token client. Firebase Auth only says who the member is;
 * it is not asked for API tokens.
 *
 * `googleAccessToken` opens Google's window, so call it from a tap: browsers block windows opened
 * any other way. Google shows the consent screen only for scopes the member has not allowed yet;
 * otherwise the window closes by itself. The token lasts about an hour and is reused, until five
 * minutes before it ends, for any later request it covers, so a calendar search, an invite email
 * and a Gmail check each ask once rather than every time. Code that runs when the app opens uses
 * `cachedGoogleToken`, which never opens anything, so a reopened app never loops windows.
 *
 * Setup, once when the app starts: `configureGoogleTokens({ clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID })`
 * with the OAuth web client (the one Firebase created for Google sign-in, whose Authorized
 * JavaScript origins list the suite's site). It also loads Google's script early, so a tap can open the
 * window straight away (Safari blocks a window opened after waiting on a download).
 *
 * Kept in memory by default. `persist: true` keeps it in localStorage until it ends, so reopening
 * the app (the wall tablet, a phone) can use it again without asking.
 */

interface Entry {
  uid: string;
  scopes: string[];
  token: string;
  expires: number;
}

const STORE_KEY = 'hh-google-tokens';
/** Stop using a token this long before Google says it ends. */
const MARGIN_MS = 5 * 60_000;
/** Google's tokens last an hour; used when the answer doesn't say. */
const DEFAULT_LIFETIME_S = 3600;

let memory: Entry[] = [];
let configuredClientId: string | undefined;
const pending = new Map<string, Promise<string>>();

/** Why Google gave no token. `code` is what `./feedback` reads to word it. */
export type GoogleTokenErrorCode = 'popup_closed' | 'popup_failed_to_open' | 'access_denied' | 'not_configured' | 'unavailable' | 'unknown';

export class GoogleTokenError extends Error {
  constructor(
    message: string,
    readonly code: GoogleTokenErrorCode,
  ) {
    super(message);
    this.name = 'GoogleTokenError';
  }
}

export interface GoogleTokensConfig {
  /** The OAuth web client id (`VITE_GOOGLE_CLIENT_ID`). Empty or missing leaves tokens unavailable. */
  clientId?: string;
  /** Load Google's script now so the first tap opens the window at once (default true). */
  preload?: boolean;
}

/** Call once at startup with the app's OAuth web client id. */
export function configureGoogleTokens({ clientId, preload = true }: GoogleTokensConfig): void {
  configuredClientId = clientId || undefined;
  if (configuredClientId && preload && typeof document !== 'undefined') loadGsi().catch(() => {});
}

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
  /** Keep the token in localStorage until it ends (default: memory only). */
  persist?: boolean;
  /** The error message when the member doesn't allow it, e.g. "Google did not grant calendar access." */
  deniedMessage?: string;
  /** The OAuth web client id, when `configureGoogleTokens` wasn't called. */
  clientId?: string;
}

/**
 * A token covering `scopes`: the cached one when there is one, otherwise from Google's window.
 * Call from a tap. Rejects with a `GoogleTokenError` when the window is closed (`popup_closed`),
 * blocked (`popup_failed_to_open`) or the member says no (`access_denied`); `./feedback` words
 * each (`popupCancelled`, `popupBlocked`, `googleAccessMessage`).
 */
export async function googleAccessToken(auth: Auth, scopes: readonly string[], { persist = false, deniedMessage = kt('googleToken.denied'), clientId }: GoogleTokenOptions = {}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error(kt('feedback.signInFirst'));
  const cached = cachedGoogleToken(auth, scopes);
  if (cached) return cached;
  const client_id = clientId || configuredClientId;
  if (!client_id) throw new GoogleTokenError(kt('googleToken.notConfigured'), 'not_configured');

  const key = `${user.uid} ${[...scopes].sort().join(' ')}`;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const ask = async (): Promise<string> => {
    const gsi =
      loadedGsi() ??
      (await loadGsi().catch(() => {
        throw new GoogleTokenError(kt('googleToken.unreachable'), 'unavailable');
      }));
    const answer = await new Promise<GsiTokenResponse>((resolve, reject) => {
      const client = gsi.oauth2.initTokenClient({
        client_id,
        scope: scopes.join(' '),
        hint: user.email ?? undefined,
        include_granted_scopes: true,
        callback: resolve,
        error_callback: (e) => reject(gsiWindowError(e)),
      });
      client.requestAccessToken({ prompt: '' });
    });
    if (answer.error === 'access_denied') throw new GoogleTokenError(deniedMessage, 'access_denied');
    if (answer.error) throw new GoogleTokenError(kt('googleToken.answered', { error: answer.error_description || answer.error }), 'unknown');
    const granted = answer.scope ? answer.scope.split(/\s+/).filter(Boolean) : [...scopes];
    // The consent screen lets the member untick a scope; a token without it would only fail later.
    if (!answer.access_token || !scopes.every((s) => granted.includes(s))) throw new GoogleTokenError(deniedMessage, 'access_denied');
    const lifetime = Number(answer.expires_in) || DEFAULT_LIFETIME_S;
    const entry: Entry = { uid: user.uid, scopes: [...new Set([...scopes, ...granted])], token: answer.access_token, expires: Date.now() + lifetime * 1000 - MARGIN_MS };
    const replaced = (e: Entry) => e.expires <= Date.now() || (e.uid === entry.uid && e.scopes.every((s) => entry.scopes.includes(s)));
    memory = [...memory.filter((e) => !replaced(e)), entry];
    if (persist) writeStored([...stored().filter((e) => !replaced(e)), entry]);
    return entry.token;
  };

  const request = ask().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/**
 * A one-time authorization code for `scopes`, from Google's code client in a popup, for a server
 * to exchange for lasting (offline) access with the client's secret: huishouden/calendar's Google
 * Calendar sync, Spending's alert inbox. The server exchanges it with `redirect_uri=postmessage`. Call from a tap. Rejects
 * as `googleAccessToken` does when the window is closed, blocked, or a scope is left unticked;
 * `googleWindowMessage` (`./feedback`) words each. Calling it again while Google's window is still
 * open brings that window to the front and returns the same answer.
 */
export interface GoogleAuthCodeOptions extends Pick<GoogleTokenOptions, 'deniedMessage' | 'clientId'> {
  /**
   * Let the person pick any Google account (Google's account chooser), not the one they signed in
   * with: Spending's alert inbox, where card alerts arrive at another Gmail address. Asks only for
   * `scopes` (no earlier grants added), so the code is for that account alone.
   */
  selectAccount?: boolean;
}

/** The code request waiting on Google's window, so a second tap brings that window back rather than starting over. */
let codeInFlight: { key: string; client: { requestCode(): void }; answer: Promise<{ code: string; scope: string }> } | null = null;

export async function googleAuthCode(auth: Auth, scopes: readonly string[], { deniedMessage = kt('googleToken.denied'), clientId, selectAccount = false }: GoogleAuthCodeOptions = {}): Promise<{ code: string; scope: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error(kt('feedback.signInFirst'));
  const client_id = clientId || configuredClientId;
  if (!client_id) throw new GoogleTokenError(kt('googleToken.notConfigured'), 'not_configured');
  const key = `${client_id} ${user.uid} ${selectAccount} ${[...scopes].sort().join(' ')}`;
  if (codeInFlight?.key === key) {
    // Google names its window, so asking again opens nothing new: the same window comes to the front.
    codeInFlight.client.requestCode();
    return codeInFlight.answer;
  }
  // Nothing may be awaited between the tap and requestCode() when Google's script is already here
  // (it is preloaded at startup): a browser blocks a window opened after the tap's moment has passed.
  const gsi =
    loadedGsi() ??
    (await loadGsi().catch(() => {
      throw new GoogleTokenError(kt('googleToken.unreachable'), 'unavailable');
    }));
  let client!: { requestCode(): void };
  const reply = new Promise<GsiCodeResponse>((resolve, reject) => {
    client = gsi.oauth2.initCodeClient({
      client_id,
      scope: scopes.join(' '),
      ux_mode: 'popup',
      include_granted_scopes: !selectAccount,
      ...(selectAccount ? { select_account: true } : user.email ? { login_hint: user.email } : {}),
      callback: resolve,
      error_callback: (e) => reject(gsiWindowError(e)),
    });
  });
  const answer = reply.then((r) => codeFrom(r, scopes, deniedMessage));
  const entry = { key, client, answer };
  codeInFlight = entry;
  const settled = () => {
    if (codeInFlight === entry) codeInFlight = null;
  };
  answer.then(settled, settled);
  try {
    client.requestCode();
  } catch (e) {
    settled();
    throw new GoogleTokenError(e instanceof Error && e.message ? e.message : kt('googleToken.noAnswer'), 'unknown');
  }
  return answer;
}

/**
 * "Continue in this tab": the same code request with Google's page in this tab instead of a window,
 * for when the browser blocks the window or it opened out of sight. The page goes to Google and
 * comes back to `redirectUri` (default: this page's address without its query) with
 * `?code=…&state=…`; that page calls `googleAuthCodeReturn` once the person is signed in and hands
 * the code to its server with the same `redirectUri`, which the server passes to Google's token
 * exchange instead of `postmessage`.
 *
 * `redirectUri` must be an Authorized redirect URI of the OAuth client, and the server must accept
 * it. `data` (a few words, e.g. which section to reopen) comes back with the code. The request's
 * `state` is 32 random bytes kept in sessionStorage with who asked and what for; the answer is taken
 * once, only in this tab, within 15 minutes, for the same person.
 */
export interface GoogleAuthRedirectOptions extends GoogleAuthCodeOptions {
  redirectUri?: string;
  data?: string;
}

const REDIRECT_KEY = 'hh-google-redirect';
const REDIRECT_TTL_MS = 15 * 60_000;

interface RedirectRequest {
  state: string;
  uid: string;
  scopes: string[];
  redirectUri: string;
  at: number;
  data?: string;
}

/** What `googleAuthCodeReturn` hands back: the code, and the `redirectUri` the server must exchange it with. */
export interface GoogleRedirectAnswer {
  code: string;
  scope: string;
  redirectUri: string;
  data?: string;
}

const thisPage = () => `${location.origin}${location.pathname}`;

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sends this tab to Google's page for a code (see `GoogleAuthRedirectOptions`). Call from a tap; resolves just before the page leaves. */
export async function googleAuthCodeRedirect(auth: Auth, scopes: readonly string[], { clientId, selectAccount = false, redirectUri = thisPage(), data }: GoogleAuthRedirectOptions = {}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error(kt('feedback.signInFirst'));
  const client_id = clientId || configuredClientId;
  if (!client_id) throw new GoogleTokenError(kt('googleToken.notConfigured'), 'not_configured');
  const gsi =
    loadedGsi() ??
    (await loadGsi().catch(() => {
      throw new GoogleTokenError(kt('googleToken.unreachable'), 'unavailable');
    }));
  const request: RedirectRequest = { state: randomState(), uid: user.uid, scopes: [...scopes], redirectUri, at: Date.now(), ...(data ? { data } : {}) };
  try {
    sessionStorage.setItem(REDIRECT_KEY, JSON.stringify(request));
  } catch {
    // Without sessionStorage the answer could not be checked on return: don't leave.
    throw new GoogleTokenError(kt('googleToken.noAnswer'), 'unknown');
  }
  gsi.oauth2
    .initCodeClient({
      client_id,
      scope: scopes.join(' '),
      ux_mode: 'redirect',
      redirect_uri: redirectUri,
      state: request.state,
      include_granted_scopes: !selectAccount,
      ...(selectAccount ? { select_account: true } : user.email ? { login_hint: user.email } : {}),
    })
    .requestCode();
}

function pendingRedirect(): RedirectRequest | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(REDIRECT_KEY) ?? 'null') as RedirectRequest | null;
    return r && typeof r.state === 'string' && typeof r.redirectUri === 'string' ? r : null;
  } catch {
    return null;
  }
}

/**
 * Whether this page is Google's answer to this tab's `googleAuthCodeRedirect` (its `state`), without
 * taking it: for opening the section that finishes the connection.
 */
export function googleRedirectReturned(): boolean {
  if (typeof location === 'undefined') return false;
  const state = new URLSearchParams(location.search).get('state');
  return !!state && pendingRedirect()?.state === state;
}

/**
 * Google's answer to this tab's `googleAuthCodeRedirect`, taken once: null when this page isn't
 * one (no `state`, or another page's). Removes `code`, `scope`, `state` and the rest from the
 * address either way. Rejects like `googleAuthCode`: `access_denied` when the person said no or
 * unticked a scope; `unknown` when the answer is for another tab, person or request, or too old.
 */
export function googleAuthCodeReturn(auth: Auth, { deniedMessage = kt('googleToken.denied') }: Pick<GoogleTokenOptions, 'deniedMessage'> = {}): GoogleRedirectAnswer | null {
  if (typeof location === 'undefined') return null;
  const answer = new URLSearchParams(location.search);
  const state = answer.get('state');
  if (!state || !(answer.has('code') || answer.has('error'))) return null;
  // The one-time code leaves the address (and so history, bookmarks and reloads) at once.
  const rest = new URLSearchParams(location.search);
  for (const k of ['code', 'scope', 'state', 'error', 'error_description', 'error_uri', 'authuser', 'prompt', 'hd', 'iss']) rest.delete(k);
  const query = rest.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  const request = pendingRedirect();
  try {
    sessionStorage.removeItem(REDIRECT_KEY);
  } catch {
    // Nothing kept: the checks below fail closed.
  }
  if (!request || request.state !== state || request.uid !== auth.currentUser?.uid || Date.now() - request.at > REDIRECT_TTL_MS) {
    throw new GoogleTokenError(kt('googleToken.noAnswer'), 'unknown');
  }
  const { code, scope } = codeFrom({ code: answer.get('code') ?? undefined, scope: answer.get('scope') ?? undefined, error: answer.get('error') ?? undefined, error_description: answer.get('error_description') ?? undefined }, request.scopes, deniedMessage);
  return { code, scope, redirectUri: request.redirectUri, ...(request.data ? { data: request.data } : {}) };
}

/** Google Identity Services' `error_callback` as a `GoogleTokenError` with its code. */
function gsiWindowError(e: { type?: string; message?: string }): GoogleTokenError {
  if (e.type === 'popup_closed') return new GoogleTokenError(kt('googleToken.closed'), 'popup_closed');
  if (e.type === 'popup_failed_to_open') return new GoogleTokenError(kt('googleToken.blocked'), 'popup_failed_to_open');
  return new GoogleTokenError(e.message || kt('googleToken.noAnswer'), 'unknown');
}

function codeFrom(answer: GsiCodeResponse, scopes: readonly string[], deniedMessage: string): { code: string; scope: string } {
  if (answer.error === 'access_denied') throw new GoogleTokenError(deniedMessage, 'access_denied');
  if (answer.error || !answer.code) throw new GoogleTokenError(kt('googleToken.answered', { error: answer.error_description || answer.error || '' }), 'unknown');
  const granted = (answer.scope ?? '').split(/\s+/).filter(Boolean);
  if (granted.length && !scopes.every((s) => granted.includes(s))) throw new GoogleTokenError(deniedMessage, 'access_denied');
  return { code: answer.code, scope: answer.scope ?? scopes.join(' ') };
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
    const error = new GoogleApiError(`[${res.status}] ${label}: ${answer.error?.message ?? res.statusText}`, res.status);
    // A 401 is an hour-old token, forgotten above and asked for again: routine, not a fault.
    if (res.status !== 401) reportError(error, { where: label, api: new URL(url, 'https://x').hostname });
    throw error;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}
