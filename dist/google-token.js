import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
const STORE_KEY = 'hh-google-tokens';
/** Google access tokens last an hour; stop using one a little early. */
const LIFETIME_MS = 55 * 60_000;
let memory = [];
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
const sameScopes = (a, b) => a.scopes.length === b.scopes.length && a.scopes.every((s) => b.scopes.includes(s));
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
 * A token covering `scopes`: the cached one when there is one, otherwise from Google's popup. Call
 * from a tap the first time. Rejects with Firebase's `auth/popup-*` errors when the popup is
 * closed or blocked (see `popupCancelled` / `popupBlocked` in `./feedback`).
 */
export async function googleAccessToken(auth, scopes, { persist = false, deniedMessage = 'Google did not grant access.' } = {}) {
    const user = auth.currentUser;
    if (!user)
        throw new Error('Sign in first.');
    const cached = cachedGoogleToken(auth, scopes);
    if (cached)
        return cached;
    const provider = new GoogleAuthProvider();
    for (const scope of scopes)
        provider.addScope(scope);
    if (user.email)
        provider.setCustomParameters({ login_hint: user.email });
    const result = await reauthenticateWithPopup(user, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token)
        throw new Error(deniedMessage);
    const entry = { uid: user.uid, scopes: [...scopes], token, expires: Date.now() + LIFETIME_MS };
    const replaced = (e) => e.expires <= Date.now() || (e.uid === entry.uid && sameScopes(e, entry));
    memory = [...memory.filter((e) => !replaced(e)), entry];
    if (persist)
        writeStored([...stored().filter((e) => !replaced(e)), entry]);
    return token;
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
        throw new GoogleApiError(`[${res.status}] ${label}: ${answer.error?.message ?? res.statusText}`, res.status);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {});
}
