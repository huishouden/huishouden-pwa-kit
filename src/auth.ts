import { GoogleAuthProvider, signInWithCredential, type Auth, type User } from 'firebase/auth';

/**
 * Silent Google sign-in for a family of apps on different domains.
 *
 * Browsers keep each site's Firebase session separately, so signing in on one app can't sign
 * you in on another. Google One Tap with auto-select gets close: when the browser is signed in
 * to Google and the person has used this app before, it returns an ID token with no click, and
 * Firebase signs in with it. The first visit per app shows a one-tap prompt instead.
 *
 * Requirements: the Google OAuth web client (the one Firebase created for Google sign-in) must list
 * each app's origin under "Authorized JavaScript origins"; Google Cloud has no API for that.
 */

interface GsiCredentialResponse {
  credential: string;
}
interface GsiPromptMoment {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
}
interface GoogleAccountsId {
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
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiLoading: Promise<GoogleAccountsId> | null = null;

function loadGsi(): Promise<GoogleAccountsId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  gsiLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google Identity Services did not load')));
    script.onerror = () => reject(new Error('Google Identity Services failed to load'));
    document.head.appendChild(script);
  });
  return gsiLoading;
}

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
    gsi = await loadGsi();
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
