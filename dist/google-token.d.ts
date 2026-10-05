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
/** What `googleAuthCodeReturn` hands back: the code, and the `redirectUri` the server must exchange it with. */
export interface GoogleRedirectAnswer {
    code: string;
    scope: string;
    redirectUri: string;
    data?: string;
}
/** Sends this tab to Google's page for a code (see `GoogleAuthRedirectOptions`). Call from a tap; resolves just before the page leaves. */
export declare function googleAuthCodeRedirect(auth: Auth, scopes: readonly string[], { clientId, selectAccount, redirectUri, data }?: GoogleAuthRedirectOptions): Promise<void>;
/**
 * Whether this page is Google's answer to this tab's `googleAuthCodeRedirect` (its `state`), without
 * taking it: for opening the section that finishes the connection.
 */
export declare function googleRedirectReturned(): boolean;
/**
 * Google's answer to this tab's `googleAuthCodeRedirect`, taken once: null when this page isn't
 * one (no `state`, or another page's). Removes `code`, `scope`, `state` and the rest from the
 * address either way. Rejects like `googleAuthCode`: `access_denied` when the person said no or
 * unticked a scope; `unknown` when the answer is for another tab, person or request, or too old.
 */
export declare function googleAuthCodeReturn(auth: Auth, { deniedMessage }?: Pick<GoogleTokenOptions, 'deniedMessage'>): GoogleRedirectAnswer | null;
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
