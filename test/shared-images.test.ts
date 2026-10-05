import { afterEach, describe, expect, test } from 'bun:test';
import { SHARE_SW_CONFIG, installShareHandlers } from '../src/share-sw';
import { SHARE_IMAGE_CACHE, SHARED_IMAGE_KEY, hasSharedImages, readSharedImages, resetSharedImagesForTests } from '../src/shared-images';
import { SHARE_TARGET_FILES, pwaWorkbox, shareTargetFiles, webManifest } from '../src/vite';

const base = { name: 'Demo', description: 'Demo app.', themeColor: '#000000', backgroundColor: '#ffffff' };

describe('share target for images', () => {
  test('manifest: { images: true } takes image files by POST; with contacts, both', () => {
    expect(webManifest({ ...base, shareTarget: { images: true } }).share_target).toEqual({
      ...SHARE_TARGET_FILES,
      params: { ...SHARE_TARGET_FILES.params, files: [{ name: 'image', accept: ['image/*'] }] },
    });
    expect(shareTargetFiles({ shareTarget: { contacts: true, images: true } }).params.files.map((f) => f.name)).toEqual(['contact', 'image']);
    expect(webManifest({ ...base, shareTarget: { contacts: true } }).share_target?.params).toEqual(SHARE_TARGET_FILES.params);
    expect(pwaWorkbox({ ...base, shareTarget: { images: true } }).importScripts).toEqual(['hh-share-sw.js']);
    expect(SHARE_TARGET_FILES.params.files[0].name).toBe(SHARE_SW_CONFIG.fileField);
    expect(shareTargetFiles({ shareTarget: { images: true } }).params.files[0].name).toBe(SHARE_SW_CONFIG.imageField);
  });

  test('the service worker keeps shared photos, in order, and sends the app to ?share=image', async () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const stored = new Map<string, { type: string | null; name: string | null }>();
    const sw = {
      registration: { scope: 'https://health.example.com/health/' },
      addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
      caches: {
        open: async (name: string) => ({
          put: async (key: string, res: Response) => stored.set(`${name} ${key}`, { type: res.headers.get('Content-Type'), name: res.headers.get('X-File-Name') }),
        }),
      },
    };
    installShareHandlers(sw, SHARE_SW_CONFIG);
    const form = new FormData();
    form.append('image', new File(['a'], 'front box.jpg', { type: 'image/jpeg' }));
    form.append('image', new File(['b'], 'back.png', { type: 'image/png' }));
    let answer: Promise<Response> | undefined;
    listeners.fetch({ request: new Request('https://health.example.com/health/share-target', { method: 'POST', body: form }), respondWith: (r: Promise<Response>) => (answer = r) });
    const res = await answer!;
    expect(res.headers.get('Location')).toBe('https://health.example.com/health/?share=image');
    expect([...stored.entries()]).toEqual([
      ['hh-share-images https://health.example.com/health/hh-shared-image-0', { type: 'image/jpeg', name: 'front%20box.jpg' }],
      ['hh-share-images https://health.example.com/health/hh-shared-image-1', { type: 'image/png', name: 'back.png' }],
    ]);
  });
});

describe('share target limits', () => {
  test('a post from another site is left alone; oversized and surplus files are not kept', async () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const stored: string[] = [];
    const sw = {
      registration: { scope: 'https://health.example.com/' },
      addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
      caches: { open: async () => ({ put: async (key: string) => void stored.push(key) }) },
    };
    installShareHandlers(sw, SHARE_SW_CONFIG);
    const post = async (headers: Record<string, string>, form: FormData) => {
      let answer: Promise<Response> | undefined;
      listeners.fetch({ request: new Request('https://health.example.com/share-target', { method: 'POST', body: form, headers }), respondWith: (r: Promise<Response>) => (answer = r) });
      return answer;
    };
    const one = new FormData();
    one.append('image', new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    expect(await post({ 'Sec-Fetch-Site': 'cross-site' }, one)).toBeUndefined();
    const many = new FormData();
    for (let i = 0; i < 12; i++) many.append('image', new File(['a'], `${i}.jpg`, { type: 'image/jpeg' }));
    many.append('image', new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' }));
    await post({ 'Sec-Fetch-Site': 'none' }, many);
    expect(stored.length).toBe(10);
  });
});

describe('readSharedImages', () => {
  const g = globalThis as unknown as { caches?: unknown };
  const before = g.caches;
  afterEach(() => {
    g.caches = before;
    resetSharedImagesForTests();
  });

  test('reads the kept photos once, oldest first, and leaves an ordinary launch alone', async () => {
    const kept = new Map<string, Response>([
      [`https://health.example.com/${SHARED_IMAGE_KEY}-1`, new Response('b', { headers: { 'Content-Type': 'image/png', 'X-File-Name': 'back.png' } })],
      [`https://health.example.com/${SHARED_IMAGE_KEY}-0`, new Response('a', { headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'front%20box.jpg' } })],
      ['https://health.example.com/hh-shared-contact', new Response('card')],
    ]);
    const opened: string[] = [];
    g.caches = {
      open: async (name: string) => {
        opened.push(name);
        return {
          keys: async () => [...kept.keys()].map((url) => ({ url })),
          match: async (r: { url: string }) => kept.get(r.url),
          delete: async (r: { url: string }) => kept.delete(r.url),
        };
      },
    };
    expect(await readSharedImages({ search: '' })).toBeNull();
    expect(hasSharedImages({ search: '?share=image' })).toBe(true);
    const files = (await readSharedImages({ search: '?share=image' }))!;
    expect(files.map((f) => [f.name, f.type])).toEqual([['front box.jpg', 'image/jpeg'], ['back.png', 'image/png']]);
    expect(await files[0].text()).toBe('a');
    expect(opened).toEqual([SHARE_IMAGE_CACHE]);
    expect([...kept.keys()]).toEqual(['https://health.example.com/hh-shared-contact']);
    // The same page asking again gets the same photos, not an empty cache.
    expect(await readSharedImages({ search: '?share=image' })).toBe(files);
  });

  test('an empty answer when nothing is kept or Cache Storage is missing', async () => {
    g.caches = undefined;
    expect(await readSharedImages({ search: '?share=image' })).toEqual([]);
  });
});
