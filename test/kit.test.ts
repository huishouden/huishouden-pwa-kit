import { describe, expect, test } from 'bun:test';
import { firebaseConfigFromEnv } from '../src/firebase';
import { FIREBASE_RESERVED_PATHS, linkPreview, pwaApp } from '../src/vite';

describe('firebaseConfigFromEnv', () => {
  const env = {
    VITE_FIREBASE_API_KEY: 'key',
    VITE_FIREBASE_PROJECT_ID: 'demo-project',
    VITE_FIREBASE_APP_ID: '1:2:web:3',
  };

  test('defaults authDomain to the project domain the auto-created OAuth client allows', () => {
    expect(firebaseConfigFromEnv(env).authDomain).toBe('demo-project.firebaseapp.com');
  });

  test('uses the fallback when the build has no Firebase variables', () => {
    const fallback = { apiKey: 'f', authDomain: 'f.firebaseapp.com', projectId: 'f', appId: 'x' };
    expect(firebaseConfigFromEnv({}, fallback)).toBe(fallback);
  });

  test('fails loudly with neither', () => {
    expect(() => firebaseConfigFromEnv({})).toThrow(/VITE_FIREBASE/);
  });
});

describe('FIREBASE_RESERVED_PATHS', () => {
  test('excludes the Firebase auth handler and SDK paths, not app routes', () => {
    const denied = (p: string) => FIREBASE_RESERVED_PATHS.some((r) => r.test(p));
    expect(denied('/__/auth/handler')).toBe(true);
    expect(denied('/__/firebase/init.json')).toBe(true);
    expect(denied('/')).toBe(false);
    expect(denied('/settings')).toBe(false);
  });
});

describe('pwaApp', () => {
  test('returns the vite-plugin-pwa plugins', () => {
    const plugins = pwaApp({ name: 'Demo', description: 'd', themeColor: '#000', backgroundColor: '#fff' });
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });
});

describe('linkPreview', () => {
  test('writes description, Open Graph and Twitter tags from one source, replacing old ones', () => {
    const html = '<html><head><meta name="description" content="old"><meta property="og:title" content="old"></head></html>';
    const out = linkPreview({ name: 'Huishouden Example', description: 'Looking after "things"', url: 'https://example.web.app/' }).transformIndexHtml(html);
    expect(out).not.toContain('content="old"');
    expect(out).toContain('<meta name="description" content="Looking after &quot;things&quot;" />');
    expect(out).toContain('<meta property="og:image" content="https://example.web.app/og.png" />');
    expect(out).toContain('<meta property="og:url" content="https://example.web.app/" />');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });
});
