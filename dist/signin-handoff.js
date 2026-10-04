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
 */
/** The portal page that hands a signed-in person over to a service. */
export const CONNECT_PATH = '/connect';
export const HANDOFF_PATH = '/connect/hand-off';
export const CALLBACK_PATH = '/connect/callback';
/** The portal's `/connect` URL for a sign-in. */
export function connectUrl(site, params) {
    const url = new URL(CONNECT_PATH, site);
    url.searchParams.set('service', params.service);
    url.searchParams.set('state', params.state);
    url.searchParams.set('client', params.client.slice(0, 80));
    if (params.redirectHost)
        url.searchParams.set('host', params.redirectHost.slice(0, 200));
    if (params.purpose)
        url.searchParams.set('purpose', params.purpose);
    return url.href;
}
/** The parameters on the portal's `/connect` page, or null when they don't make a sign-in. */
export function parseConnectParams(search) {
    const q = new URLSearchParams(search);
    const service = q.get('service') ?? '';
    const state = q.get('state') ?? '';
    const client = (q.get('client') ?? '').trim();
    let origin;
    try {
        const url = new URL(service);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
            return null;
        origin = url.origin;
    }
    catch {
        return null;
    }
    if (!/^[A-Za-z0-9._~-]{16,512}$/.test(state) || !client)
        return null;
    const purpose = q.get('purpose');
    const host = q.get('host');
    return { service: origin, state, client: client.slice(0, 80), ...(host ? { redirectHost: host.slice(0, 200) } : {}), ...(purpose === 'assistant' || purpose === 'calendar' ? { purpose } : {}) };
}
export function isHandoffRequest(v) {
    if (!v || typeof v !== 'object')
        return false;
    const r = v;
    return (typeof r.state === 'string' &&
        r.state.length >= 16 &&
        r.state.length <= 512 &&
        typeof r.refreshToken === 'string' &&
        r.refreshToken.length >= 20 &&
        r.refreshToken.length <= 4096 &&
        (r.lang === undefined || r.lang === 'en' || r.lang === 'es' || r.lang === 'nl') &&
        (r.timeZone === undefined || (typeof r.timeZone === 'string' && r.timeZone.length <= 64)));
}
const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
async function keysFor(code) {
    const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`huishouden-handoff-key\u0000${code}`)));
    const id = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`huishouden-handoff-id\u0000${code}`)));
    return { id: `handoff:${b64url(id)}`, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}
/**
 * Keeps `value` for `ttlSeconds` (at least 60, KV's minimum) under a new random code, encrypted
 * with a key derived from the code: KV holds neither the code nor anything readable. Returns the code.
 */
export async function storeHandoff(store, value, ttlSeconds = 120) {
    const code = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const { id, key } = await keysFor(code);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
    await store.put(id, `${b64url(iv)}.${b64url(sealed)}`, { expirationTtl: Math.max(60, ttlSeconds) });
    return code;
}
/** The hand-off stored under `code`, once (it is deleted), and only for the `state` it was made for. */
export async function takeHandoff(store, code, state) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(code))
        return null;
    const { id, key } = await keysFor(code);
    const stored = await store.get(id);
    if (!stored)
        return null;
    await store.delete(id);
    const [iv, sealed] = stored.split('.');
    try {
        const value = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(iv) }, key, unb64url(sealed))));
        return value.state === state ? value : null;
    }
    catch {
        return null;
    }
}
