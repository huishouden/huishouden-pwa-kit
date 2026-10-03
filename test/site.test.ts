import { describe, expect, test } from 'bun:test';
import { headersFor } from '../src/security-headers';
import {
  REDIRECT_ALL_BUT_WORKER,
  appUrl,
  featuresOf,
  normalizePath,
  redirectConfig,
  retiredWorkerSource,
  sharedSite,
  siteApps,
  siteConfig,
  staleApps,
} from '../src/site';
import { globToRegExp } from '../src/security-headers';

const registry = [
  { name: 'Huishouden', repo: 'portal', site: 'example-family', path: '/' },
  { name: 'Pet', repo: 'pet', site: 'example-pet', path: 'pet', redirect: true },
  { name: 'Baby', repo: 'baby', site: 'example-baby', path: '/baby/' },
  { name: 'Later', repo: 'later', site: 'example-later' },
];

describe('registry', () => {
  test('apps with a path, the portal first, paths normalized', () => {
    expect(siteApps(registry).map((a) => [a.repo, a.path])).toEqual([['portal', '/'], ['pet', '/pet/'], ['baby', '/baby/']]);
    expect(sharedSite(registry)).toBe('example-family');
  });

  test('refuses a registry the site cannot be built from', () => {
    expect(() => siteApps({})).toThrow();
    expect(() => siteApps(registry.slice(1))).toThrow(/path "\/"/);
    expect(() => siteApps([...registry, { repo: 'x', site: 'example-x', path: '/pet/' }])).toThrow(/two apps/);
    expect(() => siteApps([...registry, { repo: 'x', site: 'example-x', path: '/a/b/' }])).toThrow(/one lowercase folder/);
    expect(() => siteApps([...registry, { repo: 'x', site: 'example-x', path: '/__/' }])).toThrow(/Firebase/);
    expect(() => siteApps([...registry, { repo: '../x', site: 'example-x', path: '/x/' }])).toThrow(/bad repo/);
  });

  test('normalizePath', () => {
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('pet/')).toBe('/pet/');
  });
});

describe('appUrl', () => {
  test('absolute links under the app path, on the page origin', () => {
    expect(appUrl('/pet/', '?tab=care', 'https://example-family.web.app')).toBe('https://example-family.web.app/pet/?tab=care');
    expect(appUrl('/pet/', '/meds/c1', 'https://example-family.web.app')).toBe('https://example-family.web.app/pet/meds/c1');
    expect(appUrl('/home/', '#upkeep', 'https://example-family.web.app')).toBe('https://example-family.web.app/home/#upkeep');
    expect(appUrl('/', '', 'https://example-family.web.app')).toBe('https://example-family.web.app/');
    expect(appUrl('/pet/', '', 'https://example-staging-pet.web.app')).toBe('https://example-staging-pet.web.app/pet/');
  });
});

describe('siteConfig', () => {
  const config = siteConfig('example-family', [{ path: '/', features: { camera: true } }, { path: '/pet/', features: { camera: true } }, { path: '/baby/', features: { geolocation: true } }]);
  const rewrite = (path: string) => config.rewrites!.find((r) => globToRegExp(r.source).test(path))?.destination;

  test('each app answers its own routes; the rest is the portal', () => {
    expect(rewrite('/pet/')).toBe('/pet/index.html');
    expect(rewrite('/pet/meds/c1')).toBe('/pet/index.html');
    expect(rewrite('/baby/feeds')).toBe('/baby/index.html');
    expect(rewrite('/privacy')).toBe('/index.html');
    expect(rewrite('/petals')).toBe('/index.html');
  });

  test('a path without its slash redirects to it', () => {
    expect(config.redirects).toEqual([
      { source: '/baby', destination: '/baby/', type: 301 },
      { source: '/pet', destination: '/pet/', type: 301 },
    ]);
  });

  test("security headers everywhere but Firebase's /__/; each app only its own features", () => {
    const h = (p: string) => headersFor(config.headers!, p);
    for (const p of ['/', '/pet/', '/pet/assets/index-abc.js', '/privacy', '/baby/feeds']) expect(h(p).get('x-frame-options'), p).toBe('DENY');
    for (const p of ['/', '/privacy', '/petals', '/pet/', '/pet/meds/c1']) expect(h(p).get('permissions-policy'), p).toBe('camera=(self), microphone=(), geolocation=()');
    for (const p of ['/baby/', '/baby/feeds']) expect(h(p).get('permissions-policy'), p).toBe('camera=(), microphone=(), geolocation=(self)');
    expect(h('/__/auth/handler').has('x-frame-options')).toBe(false);
    expect(h('/__/auth/handler').has('permissions-policy')).toBe(false);
  });

  test("workers, manifests and pages are fetched fresh; each app's assets are immutable", () => {
    const cache = (p: string) => headersFor(config.headers!, p).get('cache-control');
    for (const p of ['/sw.js', '/pet/sw.js', '/pet/registerSW.js', '/baby/hh-push-sw.js', '/pet/manifest.webmanifest', '/', '/pet/', '/hh-site.json']) expect(cache(p), p).toBe('no-cache');
    for (const p of ['/assets/index-abc.js', '/pet/assets/index-abc.js', '/baby/assets/x.css']) expect(cache(p), p).toContain('immutable');
    expect(cache('/pet/pwa-192.png')).toBeUndefined();
  });

  test('the portal alone', () => {
    const only = siteConfig('example-family', [{ path: '/' }]);
    expect(only.redirects).toEqual([]);
    expect(only.rewrites).toEqual([{ source: '**', destination: '/index.html' }]);
  });
});

describe('features', () => {
  test('reads Permissions-Policy values', () => {
    expect(featuresOf('camera=(self), microphone=(), geolocation=()')).toEqual({ camera: true, geolocation: false });
    expect(featuresOf('camera=(), microphone=(), geolocation=(self)')).toEqual({ camera: false, geolocation: true });
    expect(featuresOf(undefined)).toEqual({ camera: false, geolocation: false });
  });
});

describe('old sites', () => {
  const re = new RegExp(REDIRECT_ALL_BUT_WORKER.replace('(?P<rest>', '(?<rest>'));
  const rest = (p: string) => {
    const m = re.exec(p);
    return m ? (m.groups?.rest ?? '') : null;
  };

  test('every path redirects with its rest, except the worker', () => {
    expect(rest('/')).toBe('');
    expect(rest('/meds/c1')).toBe('meds/c1');
    expect(rest('/s')).toBe('s');
    expect(rest('/sw')).toBe('sw');
    expect(rest('/sw.j')).toBe('sw.j');
    expect(rest('/sw.json')).toBe('sw.json');
    expect(rest('/swim')).toBe('swim');
    expect(rest('/settings')).toBe('settings');
    expect(rest('/index.html')).toBe('index.html');
    expect(rest('/registerSW.js')).toBe('registerSW.js');
    expect(rest('/sw.js')).toBeNull();
  });

  test('redirect config', () => {
    const c = redirectConfig('example-pet', 'https://example-family.web.app/pet/', 'legacy-example-pet');
    expect(c.redirects).toEqual([{ regex: REDIRECT_ALL_BUT_WORKER, destination: 'https://example-family.web.app/pet/:rest', type: 301 }]);
    expect(c.public).toBe('legacy-example-pet');
  });

  test('the retiring worker clears caches, unregisters and reloads its windows', () => {
    const src = retiredWorkerSource();
    expect(src).toContain('skipWaiting');
    expect(src).toContain('caches.delete');
    expect(src).toContain('registration.unregister');
    expect(src).toContain('client.navigate');
    expect(() => new Function(src)).not.toThrow();
  });
});

describe('staleApps', () => {
  const manifest = { site: 's', flavor: 'production' as const, deployedAt: '', apps: { '/': { repo: 'portal', asset: 1 }, '/pet/': { repo: 'pet', asset: 2 } } };
  test('newer or missing builds are stale; apps without one are not', () => {
    expect(staleApps(manifest, { '/': 1, '/pet/': 2, '/baby/': null })).toEqual([]);
    expect(staleApps(manifest, { '/': 1, '/pet/': 3 })).toEqual(['/pet/']);
    expect(staleApps(manifest, { '/': 1, '/pet/': 2, '/baby/': 7 })).toEqual(['/baby/']);
    expect(staleApps(null, { '/': 1 })).toEqual(['/']);
  });
});
