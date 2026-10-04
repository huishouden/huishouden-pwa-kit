import { loadGsi, loadedGsi } from './gsi';
import { reportError } from './observability';
import { kt } from './i18n.js';
const STORE_KEY = 'hh-google-tokens';
/** Stop using a token this long before Google says it ends. */
const MARGIN_MS = 5 * 60_000;
/** Google's tokens last an hour; used when the answer doesn't say. */
const DEFAULT_LIFETIME_S = 3600;
let memory = [];
let configuredClientId;
const pending = new Map();
export class GoogleTokenError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'GoogleTokenError';
    }
}
/** Call once at startup with the app's OAuth web client id. */
export function configureGoogleTokens({ clientId, preload = true }) {
    configuredClientId = clientId || undefined;
    if (configuredClientId && preload && typeof document !== 'undefined')
        loadGsi().catch(() => { });
}
function stored() {
    try {
        const list = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? '[]');
        return Array.isArray(list) ? list.filter((e) => e && typeof e.token === 'string' && Array.isArray(e.scopes)) : [];
    }
    catch {
        return [];
    }
}
function writeStored(list) {
    try {
        if (list.length)
            globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(list));
        else
            globalThis.localStorage?.removeItem(STORE_KEY);
    }
    catch {
        // Storage full or unavailable (private mode): the memory copy still works for this session.
    }
}
const covers = (e, uid, scopes, now) => e.uid === uid && e.expires > now && scopes.every((s) => e.scopes.includes(s));
/** A still-valid token covering `scopes` for the signed-in member, without asking anyone; null when there is none. */
export function cachedGoogleToken(auth, scopes) {
    const user = auth.currentUser;
    if (!user)
        return null;
    const now = Date.now();
    memory = memory.filter((e) => e.expires > now);
    const hit = memory.find((e) => covers(e, user.uid, scopes, now)) ?? stored().find((e) => covers(e, user.uid, scopes, now));
    return hit?.token ?? null;
}
/**
 * A token covering `scopes`: the cached one when there is one, otherwise from Google's window.
 * Call from a tap. Rejects with a `GoogleTokenError` when the window is closed (`popup_closed`),
 * blocked (`popup_failed_to_open`) or the member says no (`access_denied`); `./feedback` words
 * each (`popupCancelled`, `popupBlocked`, `googleAccessMessage`).
 */
export async function googleAccessToken(auth, scopes, { persist = false, deniedMessage = kt('googleToken.denied'), clientId } = {}) {
    const user = auth.currentUser;
    if (!user)
        throw new Error(kt('feedback.signInFirst'));
    const cached = cachedGoogleToken(auth, scopes);
    if (cached)
        return cached;
    const client_id = clientId || configuredClientId;
    if (!client_id)
        throw new GoogleTokenError(kt('googleToken.notConfigured'), 'not_configured');
    const key = `${user.uid} ${[...scopes].sort().join(' ')}`;
    const inFlight = pending.get(key);
    if (inFlight)
        return inFlight;
    const ask = async () => {
        const gsi = loadedGsi() ??
            (await loadGsi().catch(() => {
                throw new GoogleTokenError(kt('googleToken.unreachable'), 'unavailable');
            }));
        const answer = await new Promise((resolve, reject) => {
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
        if (answer.error === 'access_denied')
            throw new GoogleTokenError(deniedMessage, 'access_denied');
        if (answer.error)
            throw new GoogleTokenError(kt('googleToken.answered', { error: answer.error_description || answer.error }), 'unknown');
        const granted = answer.scope ? answer.scope.split(/\s+/).filter(Boolean) : [...scopes];
        // The consent screen lets the member untick a scope; a token without it would only fail later.
        if (!answer.access_token || !scopes.every((s) => granted.includes(s)))
            throw new GoogleTokenError(deniedMessage, 'access_denied');
        const lifetime = Number(answer.expires_in) || DEFAULT_LIFETIME_S;
        const entry = { uid: user.uid, scopes: [...new Set([...scopes, ...granted])], token: answer.access_token, expires: Date.now() + lifetime * 1000 - MARGIN_MS };
        const replaced = (e) => e.expires <= Date.now() || (e.uid === entry.uid && e.scopes.every((s) => entry.scopes.includes(s)));
        memory = [...memory.filter((e) => !replaced(e)), entry];
        if (persist)
            writeStored([...stored().filter((e) => !replaced(e)), entry]);
        return entry.token;
    };
    const request = ask().finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
}
/** The code request waiting on Google's window, so a second tap brings that window back rather than starting over. */
let codeInFlight = null;
export async function googleAuthCode(auth, scopes, { deniedMessage = kt('googleToken.denied'), clientId, selectAccount = false } = {}) {
    const user = auth.currentUser;
    if (!user)
        throw new Error(kt('feedback.signInFirst'));
    const client_id = clientId || configuredClientId;
    if (!client_id)
        throw new GoogleTokenError(kt('googleToken.notConfigured'), 'not_configured');
    const key = `${client_id} ${user.uid} ${selectAccount} ${[...scopes].sort().join(' ')}`;
    if (codeInFlight?.key === key) {
        // Google names its window, so asking again opens nothing new: the same window comes to the front.
        codeInFlight.client.requestCode();
        return codeInFlight.answer;
    }
    // Nothing may be awaited between the tap and requestCode() when Google's script is already here
    // (it is preloaded at startup): a browser blocks a window opened after the tap's moment has passed.
    const gsi = loadedGsi() ??
        (await loadGsi().catch(() => {
            throw new GoogleTokenError(kt('googleToken.unreachable'), 'unavailable');
        }));
    let client;
    const reply = new Promise((resolve, reject) => {
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
        if (codeInFlight === entry)
            codeInFlight = null;
    };
    answer.then(settled, settled);
    try {
        client.requestCode();
    }
    catch (e) {
        settled();
        throw new GoogleTokenError(e instanceof Error && e.message ? e.message : kt('googleToken.noAnswer'), 'unknown');
    }
    return answer;
}
/** Google Identity Services' `error_callback` as a `GoogleTokenError` with its code. */
function gsiWindowError(e) {
    if (e.type === 'popup_closed')
        return new GoogleTokenError(kt('googleToken.closed'), 'popup_closed');
    if (e.type === 'popup_failed_to_open')
        return new GoogleTokenError(kt('googleToken.blocked'), 'popup_failed_to_open');
    return new GoogleTokenError(e.message || kt('googleToken.noAnswer'), 'unknown');
}
function codeFrom(answer, scopes, deniedMessage) {
    if (answer.error === 'access_denied')
        throw new GoogleTokenError(deniedMessage, 'access_denied');
    if (answer.error || !answer.code)
        throw new GoogleTokenError(kt('googleToken.answered', { error: answer.error_description || answer.error || '' }), 'unknown');
    const granted = (answer.scope ?? '').split(/\s+/).filter(Boolean);
    if (granted.length && !scopes.every((s) => granted.includes(s)))
        throw new GoogleTokenError(deniedMessage, 'access_denied');
    return { code: answer.code, scope: answer.scope ?? scopes.join(' ') };
}
/**
 * Stops using a token: pass the one Google rejected (a 401: revoked, or expired early) so the next
 * call asks again, or nothing to forget every token (signing out).
 */
export function forgetGoogleToken(token) {
    memory = token ? memory.filter((e) => e.token !== token) : [];
    writeStored(token ? stored().filter((e) => e.token !== token) : []);
}
/** A Google REST API error with its HTTP status. */
export class GoogleApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'GoogleApiError';
    }
}
/**
 * GET or POST a Google REST API with a token. A 401 forgets the token, so the next attempt asks
 * Google again; any failure throws `GoogleApiError` with Google's own message:
 * "[403] Calendar: Request had insufficient authentication scopes."
 */
export async function googleFetch(token, url, { label = 'Google', method = 'GET', body } = {}) {
    const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status === 401)
        forgetGoogleToken(token);
    if (!res.ok) {
        const answer = (await res.json().catch(() => ({})));
        const error = new GoogleApiError(`[${res.status}] ${label}: ${answer.error?.message ?? res.statusText}`, res.status);
        // A 401 is an hour-old token, forgotten above and asked for again: routine, not a fault.
        if (res.status !== 401)
            reportError(error, { where: label, api: new URL(url, 'https://x').hostname });
        throw error;
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {});
}
