/**
 * Apps write through `@huishouden/pwa-kit/firestore` so a write made just before the app closes
 * isn't lost (see firestore.ts). Firestore's own write functions have the same signatures, so the
 * type checker can't tell an editor's auto-import of `setDoc` from `firebase/firestore` apart; this
 * check can. Field sentinels count too: Firestore's own `arrayUnion`, `arrayRemove` and `increment`
 * can't be noted.
 */
export const OUTBOX_WRITES = ['setDoc', 'updateDoc', 'deleteDoc', 'addDoc', 'writeBatch', 'arrayUnion', 'arrayRemove', 'increment'] as const;

export interface RawWrite {
  line: number;
  name: string;
}

const namedFrom = /(import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]firebase\/firestore['"]/g;
const namespaceFrom = /(?:import|export)\s+(type\s+)?\*(?:\s+as\s+\w+)?\s+from\s*['"]firebase\/firestore['"]/g;

const lineAt = (source: string, index: number) => source.slice(0, index).split('\n').length;

/**
 * Write functions a source file takes from `firebase/firestore` instead of the kit: named imports,
 * re-exports (a local barrel would pass them on), and namespace imports (`* as fs`), which expose
 * every write and are reported as `*`.
 */
export function findRawWrites(source: string): RawWrite[] {
  const out: RawWrite[] = [];
  for (const m of source.matchAll(namedFrom)) {
    if (m[2]) continue;
    const line = lineAt(source, m.index);
    for (const part of m[3].split(',')) {
      const spec = part.trim();
      if (!spec || spec.startsWith('type ')) continue;
      const name = spec.split(/\s+as\s+/)[0].trim();
      if ((OUTBOX_WRITES as readonly string[]).includes(name)) out.push({ line, name });
    }
  }
  for (const m of source.matchAll(namespaceFrom)) if (!m[1]) out.push({ line: lineAt(source, m.index), name: '*' });
  return out.sort((a, b) => a.line - b.line);
}

/** App code, not tests: tests may write to Firestore any way they like. */
export const isAppSource = (path: string): boolean => /\.(ts|tsx|js|jsx)$/.test(path) && !/\.(test|spec)\.[jt]sx?$/.test(path) && !/(^|\/)(__tests__|__fixtures__)\//.test(path);
