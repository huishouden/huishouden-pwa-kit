/**
 * Plain words for a failed read or write. Firestore's codes become what the person can do about
 * it; everything else is just the action that failed, so no stack trace or code reaches the screen.
 */
import { reportError } from './observability';
import { kt } from './i18n.js';
/**
 * "Couldn't save: offline. It will retry when the connection is back." Also reports the failure
 * (`./observability`), except being offline, which is not a fault.
 */
export function readError(e, prefix) {
    const code = e?.code;
    if (code !== 'unavailable')
        reportError(e, { where: prefix });
    // In a household, a refusal is a role's (./roles): say who can.
    if (code === 'permission-denied')
        return kt('feedback.refused', { action: prefix });
    if (code === 'unavailable')
        return kt('feedback.offline', { action: prefix });
    return kt('feedback.failed', { action: prefix });
}
const codeOf = (e) => e?.code ?? '';
/**
 * "The person closed or cancelled the Google window": Google Identity Services' `popup_closed`
 * (`./google-token`) and Firebase Auth's popup codes (sign-in).
 */
export const POPUP_CANCELLED = ['popup_closed', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
/** Whether an error is the person closing Google's permission window rather than a failure. */
export function popupCancelled(e) {
    return POPUP_CANCELLED.includes(codeOf(e));
}
/** Whether the browser blocked Google's permission window (it was not opened from a tap). */
export function popupBlocked(e) {
    const code = codeOf(e);
    return code === 'popup_failed_to_open' || code === 'auth/popup-blocked';
}
/** Whether the person said no on Google's consent screen (or unticked a permission the app needs). */
export function accessDenied(e) {
    return codeOf(e) === 'access_denied';
}
/**
 * Words for a failed `googleAccessToken`, naming what it was for ("Gmail", "Calendar"); null when
 * the error is not about getting Google's permission, so the caller words it.
 */
export function googleAccessMessage(e, service = 'Google') {
    if (popupCancelled(e))
        return kt('feedback.accessClosed', { service });
    if (popupBlocked(e))
        return kt('feedback.popupBlocked');
    if (accessDenied(e))
        return kt('feedback.accessDenied', { service });
    const code = codeOf(e);
    if (code === 'not_configured')
        return kt('feedback.notConfigured', { service });
    if (code === 'unavailable')
        return kt('feedback.unreachable');
    return null;
}
/**
 * Words for a failed `googleAuthCode` (connecting Google Calendar, an alert inbox) or any wait on
 * Google's window, so no failure is silent (`continueHere`: the page offers "Continue in this tab",
 * `GoogleWindowWait`, and the blocked message points to it): blocked, closed before finishing, refused, or stopped
 * for another reason (reported, `./observability`). Null only when the error is not about
 * Google's window or permission, so the caller words it (a server's answer, being offline).
 */
export function googleWindowMessage(e, service = 'Google', { continueHere = false } = {}) {
    if (popupBlocked(e))
        return kt(continueHere ? 'feedback.windowBlockedHere' : 'feedback.windowBlocked');
    if (popupCancelled(e))
        return kt('feedback.windowClosed');
    const known = googleAccessMessage(e, service);
    if (known)
        return known;
    if (e instanceof Error && e.name === 'GoogleTokenError') {
        // Google's window ended some other way: say so, and keep Google's words for whoever looks into it.
        reportError(e, { where: 'Google window' });
        return kt('feedback.windowFailed');
    }
    return null;
}
