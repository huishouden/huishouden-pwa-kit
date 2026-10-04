import type { Auth } from 'firebase/auth';
/** Why Google gave no token. `code` is what `./feedback` reads to word it. */
export type GoogleTokenErrorCode = 'popup_closed' | 'popup_failed_to_open' | 'access_denied' | 'not_configured' | 'unavailable' | 'unknown';
export declare class GoogleTokenError extends Error {
    readonly code: GoogleTokenErrorCode;
    constructor(message: string, code: GoogleTokenErrorCode);
}
export interface GoogleTokensConfig {
    /** The OAuth web client id (`VITE_GOOGLE_CLIENT_ID`). Empty or missing leaves tokens unavailable. */
    clientId?: string;
    /** Load Google's script now so the first tap opens the window at once (default true). */
    preload?: boolean;
}
/** Call once at startup with the app's OAuth web client id. */
export declare function configureGoogleTokens({ clientId, preload }: GoogleTokensConfig): void;
/** A still-valid token covering `scopes` for the signed-in member, without asking anyone; null when there is none. */
export declare function cachedGoogleToken(auth: Auth, scopes: readonly string[]): string | null;
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
export declare function googleAccessToken(auth: Auth, scopes: readonly string[], { persist, deniedMessage, clientId }?: GoogleTokenOptions): Promise<string>;
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
export declare function googleAuthCode(auth: Auth, scopes: readonly string[], { deniedMessage, clientId, selectAccount }?: GoogleAuthCodeOptions): Promise<{
    code: string;
    scope: string;
}>;
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
