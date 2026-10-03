import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { findReuse, kitUnits, similarity, stripComments, tokenize, units } from '../src/reuse-check';

const kitTime = readFileSync('src/time.ts', 'utf8');
const kit = kitUnits([{ path: 'src/time.ts', source: kitTime }, { path: 'src/places.ts', source: readFileSync('src/places.ts', 'utf8') }], {
  './time': { types: './dist/time.d.ts', default: './dist/time.js' },
  './places': { types: './dist/places.d.ts', default: './dist/places.js' },
});

const pasted = `import { MINUTE } from './constants';

/** Our own copy. */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / MINUTE));
  const d = Math.floor(totalMin / (24 * 60));
  const h = Math.floor((totalMin % (24 * 60)) / 60);
  const m = totalMin % 60;
  if (d > 0) return h ? \`\${d}d \${h}h\` : \`\${d}d\`;
  if (h > 0) return m ? \`\${h}h \${m}m\` : \`\${h}h\`;
  return \`\${m}m\`;
}

export function petAge(born: number, now: number): string {
  const years = Math.floor((now - born) / (365.25 * 24 * 3600 * 1000));
  if (years < 1) return 'under a year';
  return years === 1 ? 'a year old' : \`\${years} years old\`;
}
`;

describe('reuse check', () => {
  test('finds a pasted kit function by name and line, and not app code', () => {
    const found = findReuse(pasted, kit);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line: 4, name: 'formatDuration', kit: { name: 'formatDuration', module: '@huishouden/pwa-kit/time' } });
    expect(found[0].similarity).toBeGreaterThan(0.9);
  });

  test('a renamed copy is still found; reuse-check:allow keeps one on purpose', () => {
    expect(findReuse(pasted.replaceAll('totalMin', 'minutes'), kit).map((r) => r.name)).toEqual(['formatDuration']);
    expect(findReuse(pasted.replace('/** Our own copy. */', '// reuse-check:allow the portal rounds up'), kit)).toEqual([]);
  });

  test('only what the kit exports counts', () => {
    // places.ts has a private escapeRegex; an app's own is not a copy of anything it could import.
    expect(kit.some((k) => k.name === 'escapeRegex')).toBe(false);
    expect(kit.every((k) => k.module.startsWith('@huishouden/pwa-kit/'))).toBe(true);
  });

  test('units: top-level functions and arrow constants, to the next top-level line', () => {
    const src = ['const a = (x: number) => {', '  return x;', '};', '', 'export const b = 1;', 'export default function C() {', '  return null;', '}'].join('\n');
    expect(units(src).map((u) => [u.name, u.line, u.exported])).toEqual([
      ['a', 1, false],
      ['C', 6, true],
    ]);
  });

  test('comments go, strings and regular expressions stay, lines are kept', () => {
    const src = "const q = /['\"]/g; // say 'hi\n/* a\nb */ const s = 'a // b';";
    expect(stripComments(src)).toBe("const q = /['\"]/g; \n\n const s = 'a // b';");
    expect(tokenize('a => b === c')).toEqual(['a', '=>', 'b', '===', 'c']);
    expect(similarity(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(1);
    expect(similarity(['a'], ['a'])).toBe(0);
  });
});
