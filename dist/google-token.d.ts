import { type Auth } from 'firebase/auth';
/** A still-valid token covering `scopes` for the signed-in member, without asking anyone; null when there is none. */
export declare function cachedGoogleToken(auth: Auth, scopes: readonly string[]): string | null;
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
export declare function googleAccessToken(auth: Auth, scopes: readonly string[], { persist, deniedMessage }?: GoogleTokenOptions): Promise<string>;
/**
 * Stops using a token: pass the one Google rejected (a 401: revoked, or expired early) so the next
 * call asks again, or nothing to forget every token (signing out).
 */
export declare function forgetGoogleToken(token?: string): void;
/** A Google REST API error with its HTTP status. */
export declare class GoogleApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/**
 * GET or POST a Google REST API with a token. A 401 forgets the token, so the next attempt asks
 * Google again; any failure throws `GoogleApiError` with Google's own message:
 * "[403] Calendar: Request had insufficient authentication scopes."
 */
export declare function googleFetch<T>(token: string, url: string | URL, { label, method, body }?: {
    label?: string;
    method?: string;
    body?: unknown;
}): Promise<T>;
