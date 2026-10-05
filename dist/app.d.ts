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
import { type FirebaseApp } from 'firebase/app';
import { type Auth } from 'firebase/auth';
import { type Firestore } from 'firebase/firestore';
export { emulatorPort } from './emulator-port';
import { type FirebaseWebConfig } from './firebase.js';
export interface InitAppOptions {
    /** The app's short name, as in observability and the agenda: 'car'. */
    app: string;
    /**
     * `import.meta.env`: the `VITE_FIREBASE_*`, `VITE_GOOGLE_CLIENT_ID` and `VITE_NEWRELIC_*` build
     * variables. `VITE_USE_EMULATORS=true` (the kit's app-tests job) connects Auth and Firestore to
     * the emulators on 127.0.0.1 (`VITE_EMULATOR_HOST`), ports 9099 and 8080 (`VITE_EMULATOR_AUTH_PORT`,
     * `VITE_EMULATOR_FIRESTORE_PORT`, so runs side by side on one machine don't collide).
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
    /** Signs out here, stops silent sign-in from signing straight back in, forgets this device's Google API tokens and the kit's write notes for the person (after up to 3 s for them to send; Firestore's own cache stays). */
    signOutEverywhere(): Promise<void>;
}
export declare function initApp({ app: name, env, fallback, preloadGoogle }: InitAppOptions): AppHandles;
