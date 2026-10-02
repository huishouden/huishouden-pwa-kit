/**
 * Plain words for a failed read or write. Firestore's codes become what the person can do about
 * it; everything else is just the action that failed, so no stack trace or code reaches the screen.
 */
/** "Couldn't save: offline. It will retry when the connection is back." */
export function readError(e, prefix) {
    const code = e?.code;
    if (code === 'permission-denied')
        return `${prefix}: this household doesn't allow it yet.`;
    if (code === 'unavailable')
        return `${prefix}: offline. It will retry when the connection is back.`;
    return `${prefix}.`;
}
/** Firebase Auth's popup codes for "the person closed or cancelled the Google window". */
export const POPUP_CANCELLED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
/** Whether an error is the person closing Google's permission window rather than a failure. */
export function popupCancelled(e) {
    return POPUP_CANCELLED.includes(e?.code ?? '');
}
/** Whether the browser blocked Google's permission window (it was not opened from a tap). */
export function popupBlocked(e) {
    return e?.code === 'auth/popup-blocked';
}
