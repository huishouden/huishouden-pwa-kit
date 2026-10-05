import type { PublishedStorage } from '../src/published';

/** A store of republish notes of a test's own. */
export function memoryNotes(): PublishedStorage & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as PublishedStorage & { m: Map<string, string> };
}

/**
 * Hides the page's `localStorage` (another test file's DOM, or a stub, may leave one behind) while a
 * file's tests run, so syncs that don't pass `published` read every time, as they do outside a browser.
 */
export function withoutPageStorage(beforeAll: (f: () => void) => void, afterAll: (f: () => void) => void): void {
  const g = globalThis as { localStorage?: unknown };
  let saved: PropertyDescriptor | undefined;
  beforeAll(() => {
    saved = Object.getOwnPropertyDescriptor(g, 'localStorage');
    if (saved) Object.defineProperty(g, 'localStorage', { value: undefined, configurable: true, writable: true });
  });
  afterAll(() => {
    if (saved) Object.defineProperty(g, 'localStorage', saved);
  });
}
