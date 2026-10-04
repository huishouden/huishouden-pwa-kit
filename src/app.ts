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
import { GoogleAuthProvider, connectAuthEmulator, getAuth, signInWithPopup, signOut, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { forgetSilentSignIn } from './auth.js';
import { firebaseConfigFromEnv, type FirebaseWebConfig } from './firebase.js';
import { initFirestore } from './firestore.js';
import { configureGoogleTokens, forgetGoogleToken } from './google-token.js';
import { startObservability } from './observability.js';

export interface InitAppOptions {
  /** The app's short name, as in observability and the agenda: 'car'. */
  app: string;
  /**
   * `import.meta.env`: the `VITE_FIREBASE_*`, `VITE_GOOGLE_CLIENT_ID` and `VITE_NEWRELIC_*` build
   * variables. `VITE_USE_EMULATORS=true` (the kit's app-tests job) connects Auth and Firestore to
   * the emulators on 127.0.0.1 (`VITE_EMULATOR_HOST`), ports 9099 and 8080.
   */
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
  const emulators = env.VITE_USE_EMULATORS === 'true' || env.VITE_USE_EMULATORS === true;
  const emulatorHost = typeof env.VITE_EMULATOR_HOST === 'string' && env.VITE_EMULATOR_HOST ? env.VITE_EMULATOR_HOST : '127.0.0.1';
  // getApps: a hot reload or a second import reuses the app rather than failing on a duplicate.
  const app = getApps()[0] ?? initializeApp(firebaseConfigFromEnv(env, fallback));
  const auth = getAuth(app);
  if (emulators) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  // Error, speed and anonymous usage reports (the portal's /privacy page); off without VITE_NEWRELIC_*.
  startObservability({ app: name, env });
  const googleClientId = typeof env.VITE_GOOGLE_CLIENT_ID === 'string' && env.VITE_GOOGLE_CLIENT_ID ? env.VITE_GOOGLE_CLIENT_ID : undefined;
  // Google API tokens come from Google Identity Services with this client, not from Firebase sign-in.
  configureGoogleTokens({ clientId: googleClientId, preload: preloadGoogle && !emulators });
  let db: Firestore | null = null;
  return {
    app,
    auth,
    get db() {
      if (!db) {
        db = initFirestore(app, { auth });
        if (emulators) connectFirestoreEmulator(db, emulatorHost, 8080);
      }
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
