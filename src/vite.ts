import { readFileSync } from 'node:fs';
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa';

export interface PwaAppOptions {
  name: string;
  shortName?: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  /** Manifest icons; defaults to /pwa-192.png, /pwa-512.png, /pwa-maskable-512.png (what pwa-icons writes). */
  icons?: { src: string; sizes: string; type: string; purpose: string }[];
  /** Files in public/ to precache besides the build output (icons, favicons). */
  includeAssets?: string[];
  /**
   * The app's public address (https://<site>.web.app). Link previews need absolute URLs for the
   * page and image; without it they fall back to relative ones, which some messengers ignore.
   */
  url?: string;
  /** Overrides merged last, for anything app-specific. */
  overrides?: Partial<VitePWAOptions>;
}

/**
 * Vite PWA plugin with the conventions every app here shares: auto-updating service worker,
 * standalone manifest with 192/512/maskable icons from public/, and Firebase-safe navigation.
 */
export function pwaApp(options: PwaAppOptions) {
  const { overrides = {} } = options;
  return [buildStamp(), linkPreview(options), ...VitePWA({
    registerType: 'autoUpdate',
    includeAssets: options.includeAssets ?? ['icon.svg', 'apple-touch-icon.png', 'og.png'],
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

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * What a shared link shows (Messages, WhatsApp, Slack...): the page description and Open Graph /
 * Twitter tags, written from the same name and description as the manifest so there is one source.
 * Any description or og:/twitter: tags already in index.html are replaced.
 */
export function linkPreview(options: Pick<PwaAppOptions, 'name' | 'description' | 'url'>) {
  const base = options.url?.replace(/\/$/, '') ?? '';
  const tags: [string, string, string][] = [
    ['name', 'description', options.description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Huishouden'],
    ['property', 'og:title', options.name],
    ['property', 'og:description', options.description],
    ['property', 'og:image', `${base}/og.png`],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', options.name],
    ['name', 'twitter:description', options.description],
    ['name', 'twitter:image', `${base}/og.png`],
  ];
  if (base) tags.push(['property', 'og:url', `${base}/`]);
  return {
    name: 'huishouden-link-preview',
    transformIndexHtml(html: string) {
      const cleaned = html.replace(/\s*<meta\s+(?:name="description"|(?:property|name)="(?:og|twitter):[^"]*")[^>]*>/g, '');
      const meta = tags.map(([attr, key, value]) => `    <meta ${attr}="${key}" content="${escapeAttr(value)}" />`).join('\n');
      return cleaned.replace(/<\/head>/, `${meta}\n  </head>`);
    },
  };
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
    } catch {}
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
