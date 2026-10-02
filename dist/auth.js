import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { loadGsi } from './gsi';
/**
 * Signs in with Google One Tap when possible. Resolves once Google has either returned a credential
 * (signed in) or declined to show anything (unavailable, with Google's reason) — callers then show
 * their normal "Sign in with Google" button. Never throws for the "not available" cases.
 */
export async function signInSilently(auth, googleClientId) {
    await auth.authStateReady();
    if (auth.currentUser)
        return { status: 'already-signed-in', user: auth.currentUser };
    let gsi;
    try {
        gsi = (await loadGsi()).id;
    }
    catch (e) {
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
                }
                catch (e) {
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
export async function forgetSilentSignIn() {
    if (window.google?.accounts?.id)
        window.google.accounts.id.disableAutoSelect();
}
