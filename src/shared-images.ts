/**
 * Photos shared into the app (Gallery → Share → the app; Android and desktop Chrome, with
 * `pwaApp({ shareTarget: { images: true } })`). The service worker (`./share-sw`) keeps them in
 * Cache Storage and sends the app to `?share=image`; `readSharedImages()` takes them out, once.
 * After opening whatever reads them (Scan the label), `clearSharedImages()` tidies the address bar.
 */

/** Same names as `SHARE_SW_CONFIG` in ./share-sw (kept apart: that file runs in Node at build time). */
export const SHARE_IMAGE_CACHE = 'hh-share-images';
export const SHARED_IMAGE_KEY = 'hh-shared-image';
export const SHARED_IMAGE_PARAM = { share: 'image' } as const;

/** True when the address says photos were just shared in. */
export function hasSharedImages(location: { search: string } = window.location): boolean {
  return new URLSearchParams(location.search).get('share') === SHARED_IMAGE_PARAM.share;
}

let sharedRead: Promise<File[] | null> | null = null;

/**
 * The photos waiting from a share, oldest first, or `null` when the address is not a photo share.
 * An empty list means a share arrived but held nothing the app could read. Called twice in the same
 * page it gives the same answer (StrictMode, two components).
 */
export function readSharedImages(location: { search: string } = window.location): Promise<File[] | null> {
  if (!hasSharedImages(location)) return Promise.resolve(null);
  sharedRead ??= (async () => {
    if (typeof caches === 'undefined') return [];
    const cache = await caches.open(SHARE_IMAGE_CACHE);
    const waiting = (await cache.keys())
      .filter((r) => new RegExp(`/${SHARED_IMAGE_KEY}-\\d+$`).test(r.url))
      .sort((a, b) => Number(a.url.split('-').pop()) - Number(b.url.split('-').pop()));
    const files: File[] = [];
    for (const request of waiting) {
      const hit = await cache.match(request);
      if (!hit) continue;
      const type = hit.headers.get('Content-Type') ?? 'image/jpeg';
      let name = `photo-${files.length + 1}`;
      try {
        name = decodeURIComponent(hit.headers.get('X-File-Name') ?? name);
      } catch {
        // keep the default name
      }
      files.push(new File([await hit.blob()], name, { type }));
      await cache.delete(request);
    }
    return files;
  })().catch(() => []);
  return sharedRead;
}

/** Takes `?share=image` off the address bar without reloading. */
export function clearSharedImages(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('share') !== SHARED_IMAGE_PARAM.share) return;
  url.searchParams.delete('share');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/** Forgets the answer, for tests. */
export function resetSharedImagesForTests(): void {
  sharedRead = null;
}
