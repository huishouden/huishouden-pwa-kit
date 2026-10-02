import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
/**
 * Vite PWA plugin with the conventions every app here shares: auto-updating service worker,
 * standalone manifest with 192/512/maskable icons from public/, and Firebase-safe navigation.
 */
export function pwaApp(options) {
    const { overrides = {} } = options;
    return [buildStamp(), ...VitePWA({
            registerType: 'autoUpdate',
            includeAssets: options.includeAssets ?? ['icon.svg', 'apple-touch-icon.png'],
            ...overrides,
            manifest: {
                id: '/',
                name: options.name,
                short_name: options.shortName ?? options.name,
                description: options.description,
                theme_color: options.themeColor,
                background_color: options.backgroundColor,
                display: 'standalone',
                orientation: 'any',
                start_url: '/',
                scope: '/',
                icons: options.icons ?? [
                    { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
                ...(overrides.manifest || {}),
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: FIREBASE_RESERVED_PATHS,
                ...(overrides.workbox || {}),
            },
        })];
}
/**
 * Firebase Hosting serves its own pages under /__/ (the sign-in popup at /__/auth/handler, SDK
 * config at /__/firebase/init.json). A service worker that answers those navigations with the
 * cached app turns "Sign in with Google" into a popup showing the app itself.
 */
export const FIREBASE_RESERVED_PATHS = [/^\/__\//];
/**
 * Stamps the build with `import.meta.env.VITE_APP_VERSION` (package.json version, set by the release
 * process) and `VITE_BUILD_SHA` (short commit, from CI's GITHUB_SHA), so a running app can say exactly
 * what it is. Apps show them in their account menu or settings.
 */
export function buildStamp() {
    let version = process.env.npm_package_version;
    if (!version) {
        try {
            version = JSON.parse(readFileSync('package.json', 'utf8')).version;
        }
        catch { }
    }
    const sha = (process.env.GITHUB_SHA ?? '').slice(0, 7) || 'local';
    return {
        name: 'huishouden-build-stamp',
        config: () => ({
            define: {
                'import.meta.env.VITE_APP_VERSION': JSON.stringify(version ?? '0.0.0'),
                'import.meta.env.VITE_BUILD_SHA': JSON.stringify(sha),
            },
        }),
    };
}
