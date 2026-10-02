export interface FirebaseWebConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    messagingSenderId?: string;
    storageBucket?: string;
}
type Env = Record<string, string | boolean | undefined>;
/**
 * Firebase web config from VITE_FIREBASE_* build variables (set per repo by CI), or `fallback`
 * when they are absent, e.g. a preview environment that injects its own config file.
 * The web config is public by design: it ships in the bundle, and access is enforced by Auth
 * and security rules, so it belongs in repo variables rather than secrets.
 */
export declare function firebaseConfigFromEnv(env: Env, fallback?: FirebaseWebConfig): FirebaseWebConfig;
export {};
