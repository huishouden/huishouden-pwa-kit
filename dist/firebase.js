/**
 * Firebase web config from VITE_FIREBASE_* build variables (set per repo by CI), or `fallback`
 * when they are absent, e.g. a preview environment that injects its own config file.
 * The web config is public by design: it ships in the bundle, and access is enforced by Auth
 * and security rules, so it belongs in repo variables rather than secrets.
 */
export function firebaseConfigFromEnv(env, fallback) {
    const apiKey = env.VITE_FIREBASE_API_KEY;
    if (typeof apiKey !== 'string' || !apiKey) {
        if (fallback)
            return fallback;
        throw new Error('Firebase config missing: set the VITE_FIREBASE_* variables');
    }
    const projectId = String(env.VITE_FIREBASE_PROJECT_ID ?? '');
    return {
        apiKey,
        projectId,
        // The project's default domain is the redirect URI the auto-created OAuth client allows;
        // any other domain needs its /__/auth/handler registered on that client first.
        authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`),
        appId: String(env.VITE_FIREBASE_APP_ID ?? ''),
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ? String(env.VITE_FIREBASE_MESSAGING_SENDER_ID) : undefined,
    };
}
