/**
 * Signing a person in to a Huishouden service that acts as them from a server (huishouden/connector,
 * a calendar feed): the person signs in on the suite's own site, as in every app, and the portal
 * hands the service their Firebase refresh token, which the service keeps encrypted and turns into
 * ID tokens (`./firebase-auth-rest`) for Firestore (`./firestore-rest`). The household's rules then
 * decide everything the service does. No OAuth client, redirect URI or service account to set up.
 *
 * The flow:
 *
 * 1. The service sends the browser to the portal's `/connect` page: `connectUrl(site, { service,
 *    state, client })`. `state` is the service's own, bound to that browser (a cookie).
 * 2. The portal signs the person in if needed and asks them to confirm. It then POSTs a
 *    `HandoffRequest` (state, refresh token, language, time zone) to `${service}/connect/hand-off`
 *    and gets `{ code }`. It only does this for the services it lists (`CONNECT_SERVICES` in the
 *    portal), never for an origin from the URL alone.
 * 3. The service checks the refresh token with Firebase Auth and keeps the hand-off for two minutes
 *    under the code (`storeHandoff`), encrypted with a key only the code derives.
 * 4. The portal sends the browser to `${service}/connect/callback?state=…&code=…` (a top-level GET,
 *    so the service's SameSite=Lax cookie comes along). The service takes the hand-off back once
 *    (`takeHandoff`), checks it was made for that `state`, and finishes its own sign-in.
 *
 * A stolen code is useless without the browser's cookie, and the refresh token never travels in a
 * URL.
 *
 * The `hh` command line signs in the same way with no cookie to bind to, so it binds to a proof key
 * instead (PKCE, RFC 7636, as native OAuth apps do):
 *
 * 1. `hh login` listens on 127.0.0.1 (or [::1]) on a random port, makes a random `state` and a
 *    random verifier, and opens `cliConnectUrl(site, { redirect, state, codeChallenge })`:
 *    `/connect?service=hh&redirect=http://127.0.0.1:<port>/callback&state=…&code_challenge=…`.
 * 2. The portal accepts only that exact loopback shape (`isLoopbackRedirect`: an IP literal, a port
 *    from 1024 to 65535, the path `/callback`, nothing else; never `localhost`, which a hosts file or
 *    DNS can point anywhere), signs the person in, says "Sign in to the hh command-line tool on this
 *    computer", and on Allow posts a `CliHandoffRequest` to the connector's `CLI_HANDOFF_PATH`. The
 *    connector checks the refresh token and keeps it for two minutes under a one-time code, sealed
 *    with a key only the code derives and bound to the state, the challenge and the redirect.
 * 3. The browser goes to `${redirect}?state=…&code=…` (no token in it). `hh` checks the state and
 *    posts the code with the verifier to `CLI_TOKEN_PATH`, which hands the refresh token over once
 *    (`takeCliHandoff`): a replayed, expired or mismatched code gets nothing, and the first attempt
 *    uses it up either way. Workers KV has no atomic take: two requests racing within the same moment
 *    could both read the code before the delete lands. Both would still need the PKCE verifier,
 *    which never leaves the `hh` process, so the race gives nothing to anyone else.
 */

/** The portal page that hands a signed-in person over to a service. */
export const CONNECT_PATH = '/connect';
export const HANDOFF_PATH = '/connect/hand-off';
export const CALLBACK_PATH = '/connect/callback';

export interface ConnectParams {
  /** The service's origin: "https://huishouden-connector.example.workers.dev". */
  service: string;
  /** The service's state for this sign-in, opaque to the portal. */
  state: string;
  /** Who will act for the person, shown on the confirmation: "Claude", "Calendar feed". */
  client: string;
  /** Where the service sends what it gets, shown on the confirmation: "claude.ai". */
  redirectHost?: string;
  /** What the service is, for the page's wording. */
  purpose?: 'assistant' | 'calendar' | 'cli';
  /** The command line's loopback address (`service` is `hh`): where the browser goes with the code. */
  redirect?: string;
  /** The command line's PKCE challenge (S256), which its token request must answer. */
  codeChallenge?: string;
}

/** `service` on `/connect` for the `hh` command line. */
export const CLI_SERVICE = 'hh';
/** On the connector: the portal posts a `CliHandoffRequest` here and gets `{ code }`. */
export const CLI_HANDOFF_PATH = '/cli/hand-off';
/** On the connector: `hh` posts `{ code, state, code_verifier, redirect_uri }` here for the sign-in. */
export const CLI_TOKEN_PATH = '/cli/token';
/** How long a command-line hand-off waits for `hh` to collect it. */
export const CLI_HANDOFF_TTL_SECONDS = 120;

const LOOPBACK = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{3,4})\/callback$/;

/**
 * Whether `redirect` is exactly `http://127.0.0.1:<port>/callback` or `http://[::1]:<port>/callback`
 * with a port from 1024 to 65535: the only places the portal sends a command-line sign-in. No
 * `localhost` (a name anything can resolve), no other host, path, query, fragment or user part.
 */
export function isLoopbackRedirect(redirect: string): boolean {
  const m = LOOPBACK.exec(redirect);
  if (!m) return false;
  const port = Number(m[1]);
  return port >= 1024 && port <= 65535;
}

/** A PKCE verifier as RFC 7636 allows: 43 to 128 unreserved characters. */
export const isPkceVerifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(v);

/** A PKCE S256 challenge: the base64url SHA-256 of a verifier, 43 characters. */
export const isPkceChallenge = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

/** The S256 challenge for `verifier`. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}

/** The portal's `/connect` URL for a command-line sign-in. */
export function cliConnectUrl(site: string, params: { redirect: string; state: string; codeChallenge: string }): string {
  const url = new URL(CONNECT_PATH, site);
  url.searchParams.set('service', CLI_SERVICE);
  url.searchParams.set('redirect', params.redirect);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.href;
}

/** The portal's `/connect` URL for a sign-in. */
export function connectUrl(site: string, params: ConnectParams): string {
  const url = new URL(CONNECT_PATH, site);
  url.searchParams.set('service', params.service);
  url.searchParams.set('state', params.state);
  url.searchParams.set('client', params.client.slice(0, 80));
  if (params.redirectHost) url.searchParams.set('host', params.redirectHost.slice(0, 200));
  if (params.purpose) url.searchParams.set('purpose', params.purpose);
  return url.href;
}

/** The parameters on the portal's `/connect` page, or null when they don't make a sign-in. */
export function parseConnectParams(search: string): ConnectParams | null {
  const q = new URLSearchParams(search);
  const service = q.get('service') ?? '';
  const state = q.get('state') ?? '';
  if (service === CLI_SERVICE) {
    const redirect = q.get('redirect') ?? '';
    const codeChallenge = q.get('code_challenge') ?? '';
    const method = q.get('code_challenge_method') ?? 'S256';
    if (!isLoopbackRedirect(redirect) || !isPkceChallenge(codeChallenge) || method !== 'S256') return null;
    if (!/^[A-Za-z0-9._~-]{16,512}$/.test(state)) return null;
    return { service: CLI_SERVICE, state, client: 'hh', redirect, codeChallenge, purpose: 'cli' };
  }
  const client = (q.get('client') ?? '').trim();
  let origin: string;
  try {
    const url = new URL(service);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    origin = url.origin;
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9._~-]{16,512}$/.test(state) || !client) return null;
  const purpose = q.get('purpose');
  const host = q.get('host');
  return { service: origin, state, client: client.slice(0, 80), ...(host ? { redirectHost: host.slice(0, 200) } : {}), ...(purpose === 'assistant' || purpose === 'calendar' ? { purpose } : {}) };
}

/** What the portal posts to the service's hand-off endpoint. */
export interface HandoffRequest {
  state: string;
  refreshToken: string;
  /** The person's language and time zone on this device, for the service's answers. */
  lang?: 'en' | 'es' | 'nl';
  timeZone?: string;
}

export function isHandoffRequest(v: unknown): v is HandoffRequest {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.state === 'string' &&
    r.state.length >= 16 &&
    r.state.length <= 512 &&
    typeof r.refreshToken === 'string' &&
    r.refreshToken.length >= 20 &&
    r.refreshToken.length <= 4096 &&
    (r.lang === undefined || r.lang === 'en' || r.lang === 'es' || r.lang === 'nl') &&
    (r.timeZone === undefined || (typeof r.timeZone === 'string' && r.timeZone.length <= 64))
  );
}

/** What the portal posts to the connector's `CLI_HANDOFF_PATH` for `hh login`. */
export interface CliHandoffRequest extends HandoffRequest {
  codeChallenge: string;
  redirect: string;
}

export function isCliHandoffRequest(v: unknown): v is CliHandoffRequest {
  if (!isHandoffRequest(v)) return false;
  const r = v as unknown as Record<string, unknown>;
  return isPkceChallenge(r.codeChallenge) && typeof r.redirect === 'string' && isLoopbackRedirect(r.redirect);
}

/** The few KV calls the hand-off needs (a Workers KV namespace has them). */
export interface HandoffStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function keysFor(code: string): Promise<{ id: string; key: CryptoKey }> {
  const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`huishouden-handoff-key\u0000${code}`)));
  const id = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`huishouden-handoff-id\u0000${code}`)));
  return { id: `handoff:${b64url(id)}`, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}

/**
 * Keeps `value` for `ttlSeconds` (at least 60, KV's minimum) under a new random code, encrypted
 * with a key derived from the code: KV holds neither the code nor anything readable. Returns the code.
 */
export async function storeHandoff<T extends { state: string }>(store: HandoffStore, value: T, ttlSeconds = 120): Promise<string> {
  const code = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const { id, key } = await keysFor(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  await store.put(id, `${b64url(iv)}.${b64url(sealed)}`, { expirationTtl: Math.max(60, ttlSeconds) });
  return code;
}

/** Whatever is stored under `code`, once: it is deleted before it is opened. */
async function takeOnce<T>(store: HandoffStore, code: string): Promise<T | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return null;
  const { id, key } = await keysFor(code);
  const stored = await store.get(id);
  if (!stored) return null;
  await store.delete(id);
  const [iv, sealed] = stored.split('.');
  try {
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(iv) }, key, unb64url(sealed)))) as T;
  } catch {
    return null;
  }
}

/** The hand-off stored under `code`, once (it is deleted), and only for the `state` it was made for. */
export async function takeHandoff<T extends { state: string }>(store: HandoffStore, code: string, state: string): Promise<T | null> {
  const value = await takeOnce<T>(store, code);
  return value && value.state === state ? value : null;
}

/** A command-line hand-off as the connector keeps it: who signed in, and what the code is bound to. */
export interface CliHandoff extends CliHandoffRequest {
  uid: string;
  email: string;
  /** Milliseconds since the epoch; KV's own expiry is coarser (60 s minimum, eventually consistent). */
  expiresAt: number;
}

/** Keeps a checked command-line hand-off for `CLI_HANDOFF_TTL_SECONDS` under a new one-time code. */
export function storeCliHandoff(store: HandoffStore, request: CliHandoffRequest, who: { uid: string; email: string }, now: number = Date.now()): Promise<string> {
  const value: CliHandoff = {
    state: request.state,
    refreshToken: request.refreshToken,
    codeChallenge: request.codeChallenge,
    redirect: request.redirect,
    ...(request.lang ? { lang: request.lang } : {}),
    ...(request.timeZone ? { timeZone: request.timeZone } : {}),
    uid: who.uid,
    email: who.email,
    expiresAt: now + CLI_HANDOFF_TTL_SECONDS * 1000,
  };
  return storeHandoff(store, value, CLI_HANDOFF_TTL_SECONDS);
}

/** What `hh` posts to `CLI_TOKEN_PATH`. */
export interface CliTokenRequest {
  code: string;
  state: string;
  code_verifier: string;
  redirect_uri: string;
}

export type CliTokenRefusal = 'invalid_request' | 'unknown_code' | 'state_mismatch' | 'redirect_mismatch' | 'expired' | 'challenge_mismatch';

/**
 * The command-line hand-off for `request`, once: the code is used up by the first attempt whether it
 * succeeds or not, so a code seen in a browser's history, replayed, or tried with a guessed
 * verifier gets nothing. `reason` is for the connector's own logs and tests; `hh` is told only
 * `invalid_grant`.
 */
export async function takeCliHandoff(store: HandoffStore, request: unknown, now: number = Date.now()): Promise<{ ok: true; handoff: CliHandoff } | { ok: false; reason: CliTokenRefusal }> {
  const r = (request && typeof request === 'object' ? request : {}) as Partial<Record<keyof CliTokenRequest, unknown>>;
  if (typeof r.code !== 'string' || typeof r.state !== 'string' || !isPkceVerifier(r.code_verifier) || typeof r.redirect_uri !== 'string') return { ok: false, reason: 'invalid_request' };
  const value = await takeOnce<CliHandoff>(store, r.code);
  if (!value || typeof value.codeChallenge !== 'string') return { ok: false, reason: 'unknown_code' };
  if (value.state !== r.state) return { ok: false, reason: 'state_mismatch' };
  if (value.redirect !== r.redirect_uri) return { ok: false, reason: 'redirect_mismatch' };
  if (!(value.expiresAt > now)) return { ok: false, reason: 'expired' };
  if ((await pkceChallenge(r.code_verifier)) !== value.codeChallenge) return { ok: false, reason: 'challenge_mismatch' };
  return { ok: true, handoff: value };
}
