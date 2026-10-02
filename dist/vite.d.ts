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
    /**
     * The app's public address (https://<site>.web.app). Link previews need absolute URLs for the
     * page and image; without it they fall back to relative ones, which some messengers ignore.
     */
    url?: string;
    /**
     * Show push notifications (@huishouden/pwa-kit/push): adds `hh-push-sw.js` to the build and
     * loads it into the generated service worker, which then shows reminders and opens their deep
     * link when tapped.
     */
    push?: boolean;
    /**
     * Cache the label-reading engine (@huishouden/pwa-kit/dose `readLabel`) in the service worker
     * after first use, so reading labels works offline: the tesseract.js worker, WebAssembly core
     * and English data from jsDelivr, all at pinned versions.
     */
    ocr?: boolean;
    /** Overrides merged last, for anything app-specific. */
    overrides?: Partial<VitePWAOptions>;
}
/**
 * Vite PWA plugin with the conventions every app here shares: auto-updating service worker,
 * standalone manifest with 192/512/maskable icons from public/, and Firebase-safe navigation.
 */
export declare function pwaApp(options: PwaAppOptions): ({
    name: string;
    config: () => {
        define: {
            'import.meta.env.VITE_APP_VERSION': string;
            'import.meta.env.VITE_BUILD_SHA': string;
        };
    };
} | {
    name: string;
    transformIndexHtml(html: string): string;
} | {
    name: string;
    apply: "build";
    generateBundle(this: {
        emitFile(file: {
            type: "asset";
            fileName: string;
            source: string;
        }): string;
    }): void;
} | import("vite").Plugin<any>)[];
/**
 * What a shared link shows (Messages, WhatsApp, Slack...): the page description and Open Graph /
 * Twitter tags, written from the same name and description as the manifest so there is one source.
 * Any description or og:/twitter: tags already in index.html are replaced.
 */
export declare function linkPreview(options: Pick<PwaAppOptions, 'name' | 'description' | 'url'>): {
    name: string;
    transformIndexHtml(html: string): string;
};
/** The OCR engine's files; their URLs carry exact versions, so a cached copy never goes stale. */
export declare const OCR_CACHE: {
    urlPattern: RegExp;
    handler: "CacheFirst";
    options: {
        cacheName: string;
        expiration: {
            maxEntries: number;
            maxAgeSeconds: number;
        };
        cacheableResponse: {
            statuses: number[];
        };
    };
};
/**
 * Firebase Hosting serves its own pages under /__/ (the sign-in popup at /__/auth/handler, SDK
 * config at /__/firebase/init.json). A service worker that answers those navigations with the
 * cached app turns "Sign in with Google" into a popup showing the app itself.
 */
export declare const FIREBASE_RESERVED_PATHS: RegExp[];
/**
 * Stamps the build with `import.meta.env.VITE_APP_VERSION` (package.json version, set by the release
 * process) and `VITE_BUILD_SHA` (short commit, from CI's GITHUB_SHA), so a running app can say exactly
 * what it is. Apps show them in their account menu or settings.
 */
export declare function buildStamp(): {
    name: string;
    config: () => {
        define: {
            'import.meta.env.VITE_APP_VERSION': string;
            'import.meta.env.VITE_BUILD_SHA': string;
        };
    };
};
