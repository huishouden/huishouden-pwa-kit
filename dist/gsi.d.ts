/**
 * Google Identity Services (https://accounts.google.com/gsi/client), loaded once per page and
 * shared by One Tap sign-in (`./auth`) and API access tokens (`./google-token`).
 */
export interface GsiCredentialResponse {
    credential: string;
}
export interface GsiPromptMoment {
    isNotDisplayed?: () => boolean;
    isSkippedMoment?: () => boolean;
    isDismissedMoment?: () => boolean;
    getNotDisplayedReason?: () => string;
    getSkippedReason?: () => string;
}
export interface GoogleAccountsId {
    initialize(config: {
        client_id: string;
        callback: (response: GsiCredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        use_fedcm_for_prompt?: boolean;
        itp_support?: boolean;
    }): void;
    prompt(listener?: (moment: GsiPromptMoment) => void): void;
    disableAutoSelect(): void;
}
/** What the token client hands back: a token, or `error` when the person said no. */
export interface GsiTokenResponse {
    access_token?: string;
    /** Seconds. */
    expires_in?: number | string;
    /** Space-separated scopes the token carries (with `include_granted_scopes`, earlier grants too). */
    scope?: string;
    error?: string;
    error_description?: string;
}
/** Why no response came: the window was closed or never opened. */
export interface GsiClientError {
    type: 'popup_closed' | 'popup_failed_to_open' | 'unknown' | string;
    message?: string;
}
export interface GsiTokenClient {
    requestAccessToken(overrides?: {
        prompt?: string;
        hint?: string;
        scope?: string;
    }): void;
}
export interface GoogleAccountsOAuth2 {
    initTokenClient(config: {
        client_id: string;
        scope: string;
        hint?: string;
        include_granted_scopes?: boolean;
        prompt?: string;
        callback: (response: GsiTokenResponse) => void;
        error_callback?: (error: GsiClientError) => void;
    }): GsiTokenClient;
    hasGrantedAllScopes(response: GsiTokenResponse, ...scopes: string[]): boolean;
}
export interface GoogleAccounts {
    id: GoogleAccountsId;
    oauth2: GoogleAccountsOAuth2;
}
declare global {
    interface Window {
        google?: {
            accounts: GoogleAccounts;
        };
    }
}
/** Google Identity Services once it has loaded; the script tag is added on the first call only. */
export declare function loadGsi(): Promise<GoogleAccounts>;
/** Google Identity Services when it is already loaded, so a tap can open Google's window without waiting. */
export declare function loadedGsi(): GoogleAccounts | null;
