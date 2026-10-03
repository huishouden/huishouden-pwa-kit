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
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { forgetSilentSignIn } from './auth.js';
import { firebaseConfigFromEnv, type FirebaseWebConfig } from './firebase.js';
import { initFirestore } from './firestore.js';
import { configureGoogleTokens, forgetGoogleToken } from './google-token.js';
import { startObservability } from './observability.js';

export interface InitAppOptions {
  /** The app's short name, as in observability and the agenda: 'car'. */
  app: string;
  /** `import.meta.env`: the `VITE_FIREBASE_*`, `VITE_GOOGLE_CLIENT_ID` and `VITE_NEWRELIC_*` build variables. */
  env: Record<string, string | boolean | undefined>;
  /** Web config for builds without the Firebase variables. */
  fallback?: FirebaseWebConfig;
  /** Load Google Identity Services at start (default true); tests and emulators turn it off. */
  preloadGoogle?: boolean;
}

export interface AppHandles {
  app: FirebaseApp;
  auth: Auth;
  /** Firestore with the persistent cache and the kit's outbox, opened on first use. */
  readonly db: Firestore;
  /** The OAuth web client for silent sign-in and Google API tokens; undefined when the build has none. */
  googleClientId: string | undefined;
  /** Firebase sign-in with Google in a popup, always offering the account chooser. No API scopes. */
  signInWithGoogle(): Promise<void>;
  /** Signs out here, stops silent sign-in from signing straight back in, and forgets this device's Google API tokens. */
  signOutEverywhere(): Promise<void>;
}

export function initApp({ app: name, env, fallback, preloadGoogle = true }: InitAppOptions): AppHandles {
  // getApps: a hot reload or a second import reuses the app rather than failing on a duplicate.
  const app = getApps()[0] ?? initializeApp(firebaseConfigFromEnv(env, fallback));
  const auth = getAuth(app);
  // Error, speed and anonymous usage reports (the portal's /privacy page); off without VITE_NEWRELIC_*.
  startObservability({ app: name, env });
  const googleClientId = typeof env.VITE_GOOGLE_CLIENT_ID === 'string' && env.VITE_GOOGLE_CLIENT_ID ? env.VITE_GOOGLE_CLIENT_ID : undefined;
  // Google API tokens come from Google Identity Services with this client, not from Firebase sign-in.
  configureGoogleTokens({ clientId: googleClientId, preload: preloadGoogle });
  let db: Firestore | null = null;
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
