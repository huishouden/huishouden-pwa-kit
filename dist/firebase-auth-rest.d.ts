/**
 * Firebase Auth over REST, for servers that act as a signed-in person (Cloudflare Workers such as
 * huishouden/connector): the person's refresh token (from a sign-in on the suite's own site, kept
 * encrypted by the server) buys a fresh ID token from Firebase Auth's token service, and every
 * Firestore call carries it (`./firestore-rest`), so the household's rules decide everything. No
 * service account, no Firebase SDK, no DOM.
 */
/** The project and its public web API key (the one every app ships); the URLs only for the emulators. */
/** `fetch`, or a stand-in for tests. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface AuthRestOptions {
    projectId: string;
    apiKey: string;
    /** Default https://securetoken.googleapis.com/v1; the Auth emulator's is http://127.0.0.1:9099/securetoken.googleapis.com/v1. */
    securetokenUrl?: string;
    /** Default https://identitytoolkit.googleapis.com/v1. */
    identityUrl?: string;
    fetch?: Fetch;
}
export interface Person {
    uid: string;
    /** Lowercase. */
    email: string;
}
export interface IdToken extends Person {
    token: string;
    /** ms */
    expiresAt: number;
}
/** `revoked`: the sign-in is gone for good (signed out everywhere, account disabled); `unavailable`: try again. */
export declare class FirebaseAuthError extends Error {
    readonly kind: 'revoked' | 'unverified' | 'unavailable';
    constructor(kind: 'revoked' | 'unverified' | 'unavailable', message: string);
}
/** The claims of a JWT, unverified: only for tokens that just came from Google over TLS. */
export declare function jwtClaims(token: string): Record<string, unknown>;
/** A fresh ID token for the refresh token, with who it is (Firebase Auth's token service). */
export declare function exchangeRefreshToken(options: AuthRestOptions, refreshToken: string): Promise<IdToken>;
/** Who an ID token belongs to, checked by Firebase Auth itself (accounts:lookup), for the portal's calls. */
export declare function verifyIdToken(options: AuthRestOptions, idToken: string): Promise<Person>;
/**
 * ID tokens kept in this isolate's memory until five minutes before they expire, keyed by a hash of
 * the refresh token, so a burst of tool calls asks Firebase Auth once.
 */
export declare class IdTokenCache {
    private readonly exchange;
    private readonly tokens;
    constructor(exchange: (refreshToken: string) => Promise<IdToken>);
    get(refreshToken: string, now?: number): Promise<IdToken>;
    forget(): void;
}
