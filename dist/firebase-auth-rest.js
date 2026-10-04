/**
 * Firebase Auth over REST, for servers that act as a signed-in person (Cloudflare Workers such as
 * huishouden/connector): the person's refresh token (from a sign-in on the suite's own site, kept
 * encrypted by the server) buys a fresh ID token from Firebase Auth's token service, and every
 * Firestore call carries it (`./firestore-rest`), so the household's rules decide everything. No
 * service account, no Firebase SDK, no DOM.
 */
const base = (url, fallback) => (url ?? fallback).replace(/\/$/, '');
/** `revoked`: the sign-in is gone for good (signed out everywhere, account disabled); `unavailable`: try again. */
export class FirebaseAuthError extends Error {
    kind;
    constructor(kind, message) {
        super(message);
        this.kind = kind;
    }
}
function base64UrlDecode(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}
/** The claims of a JWT, unverified: only for tokens that just came from Google over TLS. */
export function jwtClaims(token) {
    const part = token.split('.')[1];
    if (!part)
        throw new FirebaseAuthError('revoked', 'Malformed ID token');
    return JSON.parse(base64UrlDecode(part));
}
const REVOKED = ['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN', 'INVALID_GRANT_TYPE', 'MISSING_REFRESH_TOKEN', 'INVALID_ID_TOKEN'];
function personFrom(claims, projectId) {
    if (claims.aud !== projectId)
        throw new FirebaseAuthError('revoked', 'Token for another project');
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    const uid = typeof claims.user_id === 'string' ? claims.user_id : typeof claims.sub === 'string' ? claims.sub : '';
    if (!email || !uid)
        throw new FirebaseAuthError('unverified', 'The account has no email');
    // The rules accept only verified emails; refusing here says so plainly instead of every call failing.
    if (claims.email_verified !== true)
        throw new FirebaseAuthError('unverified', 'The account email is not verified');
    return { uid, email };
}
/** A fresh ID token for the refresh token, with who it is (Firebase Auth's token service). */
export async function exchangeRefreshToken(options, refreshToken) {
    const fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    let res;
    try {
        res = await fetchImpl(`${base(options.securetokenUrl, 'https://securetoken.googleapis.com/v1')}/token?key=${encodeURIComponent(options.apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        });
    }
    catch {
        throw new FirebaseAuthError('unavailable', 'Firebase Auth unreachable');
    }
    const body = (await res.json().catch(() => ({})));
    if (!res.ok || !body.id_token) {
        const reason = body.error?.message ?? '';
        if (res.status === 400 && REVOKED.some((r) => reason.startsWith(r)))
            throw new FirebaseAuthError('revoked', reason);
        throw new FirebaseAuthError('unavailable', `Firebase Auth ${res.status}`);
    }
    const person = personFrom(jwtClaims(body.id_token), options.projectId);
    return { ...person, token: body.id_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
}
/** Who an ID token belongs to, checked by Firebase Auth itself (accounts:lookup), for the portal's calls. */
export async function verifyIdToken(options, idToken) {
    const fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    const claims = jwtClaims(idToken);
    const res = await fetchImpl(`${base(options.identityUrl, 'https://identitytoolkit.googleapis.com/v1')}/accounts:lookup?key=${encodeURIComponent(options.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    }).catch(() => {
        throw new FirebaseAuthError('unavailable', 'Firebase Auth unreachable');
    });
    const body = (await res.json().catch(() => ({})));
    const user = body.users?.[0];
    if (!res.ok || !user?.localId)
        throw new FirebaseAuthError(res.status >= 500 ? 'unavailable' : 'revoked', body.error?.message ?? 'Invalid ID token');
    const person = personFrom(claims, options.projectId);
    if (person.uid !== user.localId)
        throw new FirebaseAuthError('revoked', 'Token subject mismatch');
    return person;
}
async function sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/**
 * ID tokens kept in this isolate's memory until five minutes before they expire, keyed by a hash of
 * the refresh token, so a burst of tool calls asks Firebase Auth once.
 */
export class IdTokenCache {
    exchange;
    tokens = new Map();
    constructor(exchange) {
        this.exchange = exchange;
    }
    async get(refreshToken, now = Date.now()) {
        const key = await sha256(refreshToken);
        const hit = this.tokens.get(key);
        if (hit && hit.expiresAt - 5 * 60_000 > now)
            return hit;
        const fresh = await this.exchange(refreshToken);
        if (this.tokens.size > 500)
            this.tokens.clear();
        this.tokens.set(key, fresh);
        return fresh;
    }
    forget() {
        this.tokens.clear();
    }
}
