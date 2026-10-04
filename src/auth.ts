import { GoogleAuthProvider, signInWithCredential, type Auth, type User } from 'firebase/auth';
import { loadGsi, type GoogleAccountsId } from './gsi';

/**
 * Silent Google sign-in for a family of apps on different domains.
 *
 * Browsers keep each site's Firebase session separately, so signing in on one app can't sign
 * you in on another. Google One Tap with auto-select gets close: when the browser is signed in
 * to Google and the person has used this app before, it returns an ID token with no click, and
 * Firebase signs in with it. The first visit per app shows a one-tap prompt instead.
 *
 * Requirements: the Google OAuth web client (the one Firebase created for Google sign-in) must list
 * the suite's site under "Authorized JavaScript origins" (`signInOrigins` in `./oauth-origins`;
 * docs/one-site.md "Sign-in origins"); Google Cloud has no API for that.
 */

export type SilentSignInResult =
  | { status: 'signed-in'; user: User }
  | { status: 'already-signed-in'; user: User }
  | { status: 'unavailable'; reason: string };

/**
 * Signs in with Google One Tap when possible. Resolves once Google has either returned a credential
 * (signed in) or declined to show anything (unavailable, with Google's reason) — callers then show
 * their normal "Sign in with Google" button. Never throws for the "not available" cases.
 */
export async function signInSilently(auth: Auth, googleClientId: string): Promise<SilentSignInResult> {
  await auth.authStateReady();
  if (auth.currentUser) return { status: 'already-signed-in', user: auth.currentUser };

  let gsi: GoogleAccountsId;
  try {
    gsi = (await loadGsi()).id;
  } catch (e) {
    return { status: 'unavailable', reason: e instanceof Error ? e.message : String(e) };
  }

  return new Promise((resolve) => {
    gsi.initialize({
      client_id: googleClientId,
      auto_select: true,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
      itp_support: true,
      callback: async ({ credential }) => {
        try {
          const result = await signInWithCredential(auth, GoogleAuthProvider.credential(credential));
          resolve({ status: 'signed-in', user: result.user });
        } catch (e) {
          resolve({ status: 'unavailable', reason: e instanceof Error ? e.message : String(e) });
        }
      },
    });
    gsi.prompt((moment) => {
      const reason = moment.getNotDisplayedReason?.() ?? moment.getSkippedReason?.();
      if (moment.isNotDisplayed?.() || moment.isSkippedMoment?.() || moment.isDismissedMoment?.()) {
        resolve({ status: 'unavailable', reason: reason ?? 'not displayed' });
      }
    });
  });
}

/** Call on sign-out so auto-select doesn't immediately sign the person back in. */
export async function forgetSilentSignIn(): Promise<void> {
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
}
