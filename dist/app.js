/**
 * The Firebase start-up every household app makes, in one call: the app from `VITE_FIREBASE_*`,
 * Auth (the session kept in IndexedDB, so a tablet stays signed in across restarts), observability,
 * Google API tokens with the OAuth web client, and Firestore with the kit's persistent cache and
 * write outbox (opened on first use of `db`).
 *
 * ```ts
 * // src/data/firebase.ts
 * export const { app, auth, db, googleClientId, signInWithGoogle, signOutEverywhere } = initApp({ app: 'car', env: import.meta.env });
 * ```
 */
import { getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { forgetSilentSignIn } from './auth.js';
import { firebaseConfigFromEnv } from './firebase.js';
import { initFirestore } from './firestore.js';
import { configureGoogleTokens, forgetGoogleToken } from './google-token.js';
import { startObservability } from './observability.js';
export function initApp({ app: name, env, fallback, preloadGoogle = true }) {
    // getApps: a hot reload or a second import reuses the app rather than failing on a duplicate.
    const app = getApps()[0] ?? initializeApp(firebaseConfigFromEnv(env, fallback));
    const auth = getAuth(app);
    // Error, speed and anonymous usage reports (the portal's /privacy page); off without VITE_NEWRELIC_*.
    startObservability({ app: name, env });
    const googleClientId = typeof env.VITE_GOOGLE_CLIENT_ID === 'string' && env.VITE_GOOGLE_CLIENT_ID ? env.VITE_GOOGLE_CLIENT_ID : undefined;
    // Google API tokens come from Google Identity Services with this client, not from Firebase sign-in.
    configureGoogleTokens({ clientId: googleClientId, preload: preloadGoogle });
    let db = null;
    return {
        app,
        auth,
        get db() {
            db ??= initFirestore(app, { auth });
            return db;
        },
        googleClientId,
        signInWithGoogle: async () => {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await signInWithPopup(auth, provider);
        },
        signOutEverywhere: async () => {
            await forgetSilentSignIn();
            forgetGoogleToken();
            await signOut(auth);
        },
    };
}
