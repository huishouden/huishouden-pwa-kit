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
 * Removes republish notes from the page's `localStorage`, which another test file's DOM may leave
 * behind: tests that don't pass `published` would otherwise skip syncs earlier tests made.
 */
export function clearPageNotes(): void {
  const store = (globalThis as { localStorage?: Storage }).localStorage;
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith('hh-published:')) keys.push(k);
  }
  for (const k of keys) store.removeItem(k);
}
