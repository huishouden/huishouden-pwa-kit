/**
 * Plain words for a failed read or write. Firestore's codes become what the person can do about
 * it; everything else is just the action that failed, so no stack trace or code reaches the screen.
 */
/** "Couldn't save: offline. It will retry when the connection is back." */
export declare function readError(e: unknown, prefix: string): string;
/** Firebase Auth's popup codes for "the person closed or cancelled the Google window". */
export declare const POPUP_CANCELLED: readonly ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"];
/** Whether an error is the person closing Google's permission window rather than a failure. */
export declare function popupCancelled(e: unknown): boolean;
/** Whether the browser blocked Google's permission window (it was not opened from a tap). */
export declare function popupBlocked(e: unknown): boolean;
