/**
 * Apps write through `@huishouden/pwa-kit/firestore` so a write made just before the app closes
 * isn't lost (see firestore.ts). Firestore's own write functions have the same signatures, so the
 * type checker can't tell an editor's auto-import of `setDoc` from `firebase/firestore` apart; this
 * check can. Field sentinels count too: Firestore's own `arrayUnion`, `arrayRemove` and `increment`
 * can't be noted.
 */
export const OUTBOX_WRITES = ['setDoc', 'updateDoc', 'deleteDoc', 'addDoc', 'writeBatch', 'arrayUnion', 'arrayRemove', 'increment'];
const firestoreImport = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]firebase\/firestore['"]/g;
/** Write functions a source file imports from `firebase/firestore` instead of the kit. */
export function findRawWrites(source) {
    const out = [];
    for (const m of source.matchAll(firestoreImport)) {
        if (m[1])
            continue;
        const line = source.slice(0, m.index).split('\n').length;
        for (const part of m[2].split(',')) {
            const spec = part.trim();
            if (!spec || spec.startsWith('type '))
                continue;
            const name = spec.split(/\s+as\s+/)[0].trim();
            if (OUTBOX_WRITES.includes(name))
                out.push({ line, name });
        }
    }
    return out;
}
/** App code, not tests: tests may write to Firestore any way they like. */
export const isAppSource = (path) => /\.(ts|tsx|js|jsx)$/.test(path) && !/\.(test|spec)\.[jt]sx?$/.test(path) && !/(^|\/)(__tests__|__fixtures__)\//.test(path);
