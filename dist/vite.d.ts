import { type VitePWAOptions } from 'vite-plugin-pwa';
export interface PwaAppOptions {
    name: string;
    shortName?: string;
    description: string;
    themeColor: string;
    backgroundColor: string;
    /** Manifest icons; defaults to /pwa-192.png, /pwa-512.png, /pwa-maskable-512.png (what pwa-icons writes). */
    icons?: {
        src: string;
        sizes: string;
        type: string;
        purpose: string;
    }[];
    /** Files in public/ to precache besides the build output (icons, favicons). */
    includeAssets?: string[];
    /** Overrides merged last, for anything app-specific. */
    overrides?: Partial<VitePWAOptions>;
}
/**
 * Vite PWA plugin with the conventions every app here shares: auto-updating service worker,
 * standalone manifest with 192/512/maskable icons from public/, and Firebase-safe navigation.
 */
export declare function pwaApp(options: PwaAppOptions): import("vite").Plugin<any>[];
/**
 * Firebase Hosting serves its own pages under /__/ (the sign-in popup at /__/auth/handler, SDK
 * config at /__/firebase/init.json). A service worker that answers those navigations with the
 * cached app turns "Sign in with Google" into a popup showing the app itself.
 */
export declare const FIREBASE_RESERVED_PATHS: RegExp[];
