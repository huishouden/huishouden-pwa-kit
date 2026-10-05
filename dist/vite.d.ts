import { type VitePWAOptions } from 'vite-plugin-pwa';
export interface PwaAppOptions {
    /**
     * The path the app is served under on the suite's one site (docs/one-site.md): `/pet/` for an
     * app, `/` for the portal. Sets Vite's `base`, and the manifest's `id`, `start_url`, `scope`,
     * icons and share target, the service worker's scope and its navigation fallback. Default `/`.
     */
    base?: string;
    /**
     * The portal only: paths of the other apps on the same site (`['pet', 'baby']`). The portal's
     * worker (scope `/`) then leaves navigations to them to the network instead of answering with
     * the portal, until the app's own worker takes over its path.
     */
    otherApps?: string[];
    name: string;
    shortName?: string;
    description: string;
    themeColor: string;
    backgroundColor: string;
    /** Manifest icons; defaults to <base>pwa-192.png, pwa-512.png, pwa-maskable-512.png (what pwa-icons writes). */
    icons?: {
        src: string;
        sizes: string;
        type: string;
        purpose: string;
    }[];
    /** Files in public/ to precache besides the build output (icons, favicons). */
    includeAssets?: string[];
    /**
     * The app's public address, with its path (`https://<site>.web.app/pet/`). Link previews need absolute URLs for the
     * page and image. Default with `base`: `base` on the suite's site (`SUITE_ORIGIN` in `./site`);
     * without either, relative ones, which some messengers ignore.
     */
    url?: string;
    /**
     * Show push notifications (@huishouden/pwa-kit/push): adds `hh-push-sw.js` to the build and
     * loads it into the generated service worker, which then shows reminders and opens their deep
     * link when tapped.
     */
    push?: boolean;
    /**
     * Cache the OCR engine (`readLabel` in ./dose, `readPlaceScreenshot` in ./places) in the service worker
     * after first use, so reading works offline: tesseract.js, its worker, WebAssembly core
     * and English data from jsDelivr, all at pinned versions.
     */
    ocr?: boolean;
    /**
     * Show the installed app in the phone's Share menu (Android and desktop Chrome; iOS has no share
     * targets), so Google Maps → Share → the app opens it with the place. Adds a manifest
     * `share_target` that launches `<base>?share_title=…&share_text=…&share_url=…`; read it with
     * `readSharedPlace(location)` from `@huishouden/pwa-kit/places`.
     *
     * `{ contacts: true }` also takes contact cards (Contacts → Share → the app): the share target
     * becomes a POST that the service worker receives (`hh-share-sw.js`), keeping the card for
     * `readSharedContact()` in `@huishouden/pwa-kit/contacts` (`?share=contact`) and sending shared
     * places on to the same `?share_title=…` address as before.
     *
     * `{ images: true }` takes photos the same way (Gallery → Share → the app, Android): the service
     * worker keeps them for `readSharedImages()` in `@huishouden/pwa-kit/shared-images`
     * (`?share=image`), which "Scan the label" (`LabelScan`'s `images`) reads.
     */
    shareTarget?: boolean | {
        contacts?: boolean;
        images?: boolean;
    };
    /**
     * Where the build's hashed files (`<base>assets/*`) are served from (docs/one-site.md "Asset
     * CDN"): `https://huishouden-assets.huishouden-app.workers.dev`. index.html and the service
     * worker's precache name them there; the chunks reach each other by relative URL, so the same
     * build also runs from the site's own copy. Default: the `HH_ASSET_ORIGIN` environment variable,
     * which the reusable workflow sets per flavor; unset (a local build), the site's own `assets/`.
     */
    assetOrigin?: string;
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
        base: string;
    };
} | {
    name: string;
    apply: "build";
    config: () => {
        experimental: {
            renderBuiltUrl(filename: string, { hostType, type }: {
                hostType: "js" | "css" | "html";
                type: "asset" | "public";
            }): string | {
                relative: boolean;
            } | undefined;
        };
    };
    transformIndexHtml: {
        order: "post";
        handler(html: string): string;
    };
} | {
    name: string;
    config: () => {
        define: {
            'import.meta.env.VITE_APP_VERSION': string;
            'import.meta.env.VITE_BUILD_SHA': string;
        };
    };
} | {
    name: string;
    apply: "build";
    config(user?: {
        build?: {
            assetsDir?: string;
            rollupOptions?: {
                output?: unknown;
            };
        };
    }): {
        build?: undefined;
    } | {
        build: {
            rollupOptions: {
                output: {
                    chunkFileNames: (chunk: ChunkInfo) => string;
                };
            };
        };
    };
} | {
    name: string;
    apply: "build";
    config(user?: {
        build?: {
            rollupOptions?: {
                output?: unknown;
            };
        };
    }): {
        build?: undefined;
    } | {
        build: {
            rollupOptions: {
                output: {
                    codeSplitting: {
                        groups: {
                            name: string;
                            test: RegExp;
                            priority: number;
                        }[];
                    };
                };
            };
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
/** `assetOrigin`, else `HH_ASSET_ORIGIN`; an https origin without a trailing slash, or '' for none. */
export declare function assetOriginOf(options: Pick<PwaAppOptions, 'assetOrigin'>): string;
/**
 * The build's hashed files from the asset CDN (docs/one-site.md "Asset CDN"): index.html names
 * them at `origin` (Vite's `renderBuiltUrl`), while JS and CSS reach each other and their images
 * and fonts by relative URL, so a build loaded from the site's own copy stays there. index.html
 * gets the one-time fallback script and the connection hints (`preconnect`, `dns-prefetch`) first in <head>.
 */
export declare function assetCdn(base: string, origin: string): {
    name: string;
    apply: "build";
    config: () => {
        experimental: {
            renderBuiltUrl(filename: string, { hostType, type }: {
                hostType: "js" | "css" | "html";
                type: "asset" | "public";
            }): string | {
                relative: boolean;
            } | undefined;
        };
    };
    transformIndexHtml: {
        order: "post";
        handler(html: string): string;
    };
};
/** Workbox `manifestTransforms` entry: the precache fetches `assets/*` from `origin` (with CORS), the rest from the site. */
export declare function cdnPrecache(base: string, origin: string): (entries: {
    url: string;
    revision: string | null;
    size: number;
}[]) => Promise<{
    manifest: {
        url: string;
        revision: string | null;
        size: number;
    }[];
    warnings: string[];
}>;
/** `pet`, `/pet` or `/pet/` as `/pet/`; empty or missing as `/`. */
export declare function normalizeBase(base?: string): string;
/** Sets Vite's `base` from `pwaApp({ base })`, so the app states its path once. */
export declare function sitePath(base: string): {
    name: string;
    config: () => {
        base: string;
    };
};
/**
 * Navigations the worker at `base` must leave to the network: Firebase's `/__/` pages and, for the
 * portal, every other app's path on the same site.
 */
export declare function navigationDenylist(options: Pick<PwaAppOptions, 'base' | 'otherApps'>): RegExp[];
/**
 * The Workbox options `pwaApp` passes. The kit's entries in `importScripts`, `runtimeCaching`,
 * `globIgnores` and `manifestTransforms` are kept and an app's `overrides.workbox` entries are added after them; other
 * keys in `overrides.workbox` replace the kit's.
 */
export declare function pwaWorkbox(options: PwaAppOptions): {
    manifestTransforms?: (import("workbox-build").ManifestTransform | ((entries: {
        url: string;
        revision: string | null;
        size: number;
    }[]) => Promise<{
        manifest: {
            url: string;
            revision: string | null;
            size: number;
        }[];
        warnings: string[];
    }>))[] | undefined;
    importScripts: string[];
    runtimeCaching: (import("workbox-build").RuntimeCaching | {
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
    })[];
    globIgnores: string[];
    additionalManifestEntries?: Array<string | import("workbox-build").ManifestEntry> | undefined;
    dontCacheBustURLsMatching?: RegExp | undefined;
    maximumFileSizeToCacheInBytes?: number | undefined;
    modifyURLPrefix?: {
        [key: string]: string;
    } | undefined;
    globFollow?: boolean | undefined;
    globPatterns: Array<string>;
    templatedURLs?: {
        [key: string]: string | Array<string>;
    } | undefined;
    babelPresetEnvTargets?: Array<string> | undefined;
    cacheId?: string | null | undefined;
    cleanupOutdatedCaches?: boolean | undefined;
    clientsClaim?: boolean | undefined;
    directoryIndex?: string | null | undefined;
    disableDevLogs?: boolean | undefined;
    ignoreURLParametersMatching?: Array<RegExp> | undefined;
    inlineWorkboxRuntime?: boolean | undefined;
    mode?: string | null | undefined;
    navigateFallback: string | null;
    navigateFallbackAllowlist?: Array<RegExp> | undefined;
    navigateFallbackDenylist: Array<RegExp>;
    navigationPreload?: boolean | undefined;
    offlineGoogleAnalytics?: (boolean | import("workbox-google-analytics/initialize.js").GoogleAnalyticsInitializeOptions) | undefined;
    skipWaiting?: boolean | undefined;
    sourcemap?: boolean | undefined;
    swDest?: string | undefined;
    globDirectory?: string | undefined;
};
/** The web app manifest `pwaApp` writes (before `overrides.manifest`). */
export declare function webManifest(options: PwaAppOptions): {
    icons: {
        src: string;
        sizes: string;
        type: string;
        purpose: string;
    }[];
    share_target?: {
        params: {
            files: {
                name: string;
                accept: string[];
            }[];
            title: string;
            text: string;
            url: string;
        };
        action: string;
        method: "POST";
        enctype: string;
    } | {
        action: string;
        method: "GET";
        enctype: string;
        params: {
            title: string;
            text: string;
            url: string;
        };
    } | undefined;
    id: string;
    name: string;
    short_name: string;
    description: string;
    theme_color: string;
    background_color: string;
    display: "standalone";
    orientation: "any";
    start_url: string;
    scope: string;
};
/**
 * What a shared link shows (Messages, WhatsApp, Slack...): the page description and Open Graph /
 * Twitter tags, written from the same name and description as the manifest so there is one source.
 * Any description or og:/twitter: tags already in index.html are replaced.
 */
export declare function linkPreview(options: Pick<PwaAppOptions, 'name' | 'description' | 'url' | 'base'>): {
    name: string;
    transformIndexHtml(html: string): string;
};
/**
 * The suite's light/dark choice (./theme) applied before the first paint: a small inline script at
 * the end of <head> puts `.dark` on <html> and sets `color-scheme` and the theme-color meta, so a
 * dark page never flashes light while the app's bundle loads.
 */
export declare function themeBoot(): {
    name: string;
    transformIndexHtml(html: string): string;
};
/**
 * The suite's language (./i18n) on <html lang> before the first paint: the stored choice, else the
 * first of the device's languages the suite speaks, else English. Screen readers and the browser's
 * hyphenation and translate offer read it before the app's bundle loads.
 */
export declare function langBoot(): {
    name: string;
    transformIndexHtml(html: string): string;
};
/**
 * The link-preview image (`og.png`, 1200x630) is for messengers' crawlers, never shown in the app:
 * left out of the precache, which saves every install about 25 KB of Hosting transfer.
 */
export declare const OG_IMAGE: string[];
/** File-name prefix of the New Relic agent's chunks (`./observability`). */
export declare const TELEMETRY_PREFIX = "hh-telemetry-";
/** Those chunks, left out of the precache (`globIgnores`), whatever the assets directory. */
export declare const TELEMETRY_CHUNKS = "**/hh-telemetry-*.js";
type ChunkInfo = {
    moduleIds: string[];
    name: string;
};
/**
 * Names the browser agent's lazily loaded chunks `<assetsDir>/hh-telemetry-*.js`, so the service worker
 * doesn't precache them: about 35 files a device would download on every update for reports that
 * only matter online, and that slow the first install enough to miss "controlled after one
 * reload". Other chunks keep the app's own `chunkFileNames`, or Vite's default. An app with several
 * Rollup outputs is left alone (its agent chunks are then precached).
 */
export declare function telemetryChunks(): {
    name: string;
    apply: "build";
    config(user?: {
        build?: {
            assetsDir?: string;
            rollupOptions?: {
                output?: unknown;
            };
        };
    }): {
        build?: undefined;
    } | {
        build: {
            rollupOptions: {
                output: {
                    chunkFileNames: (chunk: ChunkInfo) => string;
                };
            };
        };
    };
};
/**
 * Libraries every page loads at start and that change only when the lockfile does: React and the
 * Firebase SDK's app, Auth and Firestore. Named one by one: a group also captures modules reached
 * only by dynamic import, so anything an app or the kit loads lazily (Storage, the kit's own
 * lazy modules, locales) must not match, or it would load with the first page.
 */
export declare const STABLE_CHUNK_GROUPS: {
    name: string;
    test: RegExp;
    priority: number;
}[];
/**
 * Splits React and Firebase (`vendor-*.js`) out of the app's own code, so a deploy that changes
 * only the app keeps that file's hash: an installed copy downloads the app's chunk on update, not
 * the whole bundle again (about 300 KB compressed per app before). Hosting transfer is the suite's
 * scarcest free resource (docs/one-site.md "Bandwidth"). Needs Vite 8 (Rolldown's
 * `output.codeSplitting`); Rollup ignores it. An app that sets its own codeSplitting or several
 * outputs is left alone.
 */
export declare function stableChunks(): {
    name: string;
    apply: "build";
    config(user?: {
        build?: {
            rollupOptions?: {
                output?: unknown;
            };
        };
    }): {
        build?: undefined;
    } | {
        build: {
            rollupOptions: {
                output: {
                    codeSplitting: {
                        groups: {
                            name: string;
                            test: RegExp;
                            priority: number;
                        }[];
                    };
                };
            };
        };
    };
};
/** `SHARE_TARGET_FILES` narrowed to the kinds of file the app asked for. */
export declare function shareTargetFiles(options: Pick<PwaAppOptions, 'shareTarget'>): {
    params: {
        files: {
            name: string;
            accept: string[];
        }[];
        title: string;
        text: string;
        url: string;
    };
    action: string;
    method: "POST";
    enctype: string;
};
/**
 * GET share targets replace the action URL's query, so the parameter names carry the marker.
 * Same names as `SHARE_PARAMS` in ./places (kept apart: this file runs in Node at build time).
 */
export declare const SHARE_TARGET: {
    action: string;
    method: "GET";
    enctype: string;
    params: {
        title: string;
        text: string;
        url: string;
    };
};
/**
 * The share target with contact cards (`shareTarget: { contacts: true }`): files need a POST,
 * received by the service worker (`hh-share-sw.js`). The action is relative, so it resolves
 * against the manifest and stays inside the app's scope wherever the app is served.
 */
export declare const SHARE_TARGET_FILES: {
    action: string;
    method: "POST";
    enctype: string;
    params: {
        files: {
            name: string;
            accept: string[];
        }[];
        title: string;
        text: string;
        url: string;
    };
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
/** The site's own copy of the page (./asset-cdn `SITE_PAGE`), the CDN fallback: always from the network. */
export declare const SITE_PAGE_PATH: RegExp;
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
export {};
