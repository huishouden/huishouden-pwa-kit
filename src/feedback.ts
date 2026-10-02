/**
 * Plain words for a failed read or write. Firestore's codes become what the person can do about
 * it; everything else is just the action that failed, so no stack trace or code reaches the screen.
 */

import { reportError } from './observability';

/**
 * "Couldn't save: offline. It will retry when the connection is back." Also reports the failure
 * (`./observability`), except being offline, which is not a fault.
 */
export function readError(e: unknown, prefix: string): string {
  const code = (e as { code?: string })?.code;
  if (code !== 'unavailable') reportError(e, { where: prefix });
  // In a household, a refusal is a role's (./roles): say who can.
  if (code === 'permission-denied') return `${prefix}: only admins and members can do that.`;
  if (code === 'unavailable') return `${prefix}: offline. It will retry when the connection is back.`;
  return `${prefix}.`;
}

const codeOf = (e: unknown) => (e as { code?: string })?.code ?? '';

/**
 * "The person closed or cancelled the Google window": Google Identity Services' `popup_closed`
 * (`./google-token`) and Firebase Auth's popup codes (sign-in).
 */
export const POPUP_CANCELLED = ['popup_closed', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'] as const;

/** Whether an error is the person closing Google's permission window rather than a failure. */
export function popupCancelled(e: unknown): boolean {
  return (POPUP_CANCELLED as readonly string[]).includes(codeOf(e));
}

/** Whether the browser blocked Google's permission window (it was not opened from a tap). */
export function popupBlocked(e: unknown): boolean {
  const code = codeOf(e);
  return code === 'popup_failed_to_open' || code === 'auth/popup-blocked';
}

/** Whether the person said no on Google's consent screen (or unticked a permission the app needs). */
export function accessDenied(e: unknown): boolean {
  return codeOf(e) === 'access_denied';
}

/**
 * Words for a failed `googleAccessToken`, naming what it was for ("Gmail", "Calendar"); null when
 * the error is not about getting Google's permission, so the caller words it.
 */
export function googleAccessMessage(e: unknown, service = 'Google'): string | null {
  if (popupCancelled(e)) return `${service} access was not allowed: Google’s window was closed. Try again when you are ready.`;
  if (popupBlocked(e)) return 'The browser blocked Google’s window. Allow pop-ups for this site and try again.';
  if (accessDenied(e)) return `${service} access was not allowed. Try again and allow it on Google’s page.`;
  const code = codeOf(e);
  if (code === 'not_configured') return `${service} access is not set up for this app yet.`;
  if (code === 'unavailable') return 'Couldn’t reach Google. Check the connection and try again.';
  return null;
}
