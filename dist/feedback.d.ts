/**
 * Plain words for a failed read or write. Firestore's codes become what the person can do about
 * it; everything else is just the action that failed, so no stack trace or code reaches the screen.
 */
/**
 * "Couldn't save: offline. It will retry when the connection is back." Also reports the failure
 * (`./observability`), except being offline, which is not a fault.
 */
export declare function readError(e: unknown, prefix: string): string;
/**
 * "The person closed or cancelled the Google window": Google Identity Services' `popup_closed`
 * (`./google-token`) and Firebase Auth's popup codes (sign-in).
 */
export declare const POPUP_CANCELLED: readonly ["popup_closed", "auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"];
/** Whether an error is the person closing Google's permission window rather than a failure. */
export declare function popupCancelled(e: unknown): boolean;
/** Whether the browser blocked Google's permission window (it was not opened from a tap). */
export declare function popupBlocked(e: unknown): boolean;
/** Whether the person said no on Google's consent screen (or unticked a permission the app needs). */
export declare function accessDenied(e: unknown): boolean;
/**
 * Words for a failed `googleAccessToken`, naming what it was for ("Gmail", "Calendar"); null when
 * the error is not about getting Google's permission, so the caller words it.
 */
export declare function googleAccessMessage(e: unknown, service?: string): string | null;
