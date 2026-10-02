/**
 * Finds app code that re-implements something the kit already exports: a function, hook or
 * component whose body is nearly the same as one in the kit's sources (a pasted `formatDuration`,
 * a local `ui.tsx` with the kit's `Dialog`). Copies drift; the fix is to import the kit's.
 *
 * The comparison is by top-level declaration: each is cut into tokens (comments and whitespace
 * dropped, string contents kept), then into overlapping runs of `SHINGLE` tokens, and two
 * declarations are alike in proportion to the runs they share (Jaccard). Renamed parameters lower
 * the score a little; a different algorithm lowers it a lot. Small declarations are skipped: one-line
 * helpers look alike by accident.
 *
 * A declaration can be kept on purpose with `// reuse-check:allow <reason>` on the line above it.
 */

export const SHINGLE = 4;
/** Declarations with fewer tokens are not compared. */
export const MIN_TOKENS = 30;
/** Reported from this similarity up. */
export const THRESHOLD = 0.7;

export interface Unit {
  name: string;
  /** 1-based line of the declaration. */
  line: number;
  tokens: string[];
}

export interface KitUnit extends Unit {
  /** The import path that exports it: `@huishouden/pwa-kit/time`. */
  module: string;
}

export interface Reuse {
  line: number;
  name: string;
  kit: { name: string; module: string };
  /** 0 to 1. */
  similarity: number;
}

const ALLOW = /\/\/\s*reuse-check:allow\s+\S/;

/** Comments removed, keeping line breaks so line numbers still hold. Strings, templates and regular expressions are left alone. */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
    } else if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]$|^$|\breturn$/.test(out.slice(-40).trimEnd())) {
      // A regular expression literal: copied whole, so a quote inside it doesn't start a string.
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== '\n' && (inClass || source[j] !== '/')) {
        if (source[j] === '\\') j++;
        else if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        j++;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export const tokenize = (code: string): string[] => code.match(/[A-Za-z_$][\w$]*|\d[\w.]*|=>|===|!==|\?\?|&&|\|\||\.\.\.|\S/g) ?? [];

const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:<[^>]*>\s*)?(?:\(|[A-Za-z_$][\w$]*\s*=>|function))/;

/**
 * Top-level functions, hooks and components (`function x`, `const x = (…) =>`), each running to
 * the next line that starts at column 0 with something other than a closing bracket.
 */
export function units(source: string): (Unit & { allowed: boolean; exported: boolean })[] {
  const lines = source.split('\n');
  const code = stripComments(source).split('\n');
  const starts: { name: string; index: number }[] = [];
  const boundaries: number[] = [];
  code.forEach((l, index) => {
    if (!l || /^[\s})\]]/.test(l)) return;
    boundaries.push(index);
    const m = DECLARATION.exec(l);
    if (m) starts.push({ name: m[1] ?? m[2], index });
  });
  return starts.map(({ name, index }) => {
    const end = boundaries.find((b) => b > index) ?? code.length;
    return {
      name,
      line: index + 1,
      tokens: tokenize(code.slice(index, end).join('\n')),
      allowed: index > 0 && ALLOW.test(lines[index - 1]),
      exported: /^export\b/.test(code[index]),
    };
  });
}

const shingles = (tokens: string[]): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= tokens.length; i++) out.add(tokens.slice(i, i + SHINGLE).join(' '));
  return out;
};

export function similarity(a: string[], b: string[]): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const s of sa) if (sb.has(s)) shared++;
  return shared / (sa.size + sb.size - shared);
}

/** The kit declarations an app could import: exported from the modules `exports` lists, by import path. */
export function kitUnits(files: { path: string; source: string }[], exportsMap: Record<string, unknown>, packageName = '@huishouden/pwa-kit'): KitUnit[] {
  const byFile = new Map<string, string>();
  for (const [subpath, target] of Object.entries(exportsMap)) {
    const file = typeof target === 'object' && target ? (target as { default?: string }).default : typeof target === 'string' ? target : undefined;
    const m = file && /^\.\/dist\/(.+)\.js$/.exec(file);
    if (m) byFile.set(m[1], `${packageName}/${subpath.replace(/^\.\//, '')}`);
  }
  const out: KitUnit[] = [];
  for (const f of files) {
    const module = byFile.get(f.path.replace(/^(\.\/)?src\//, '').replace(/\.tsx?$/, ''));
    if (!module) continue;
    for (const u of units(f.source)) if (u.exported && u.tokens.length >= MIN_TOKENS) out.push({ name: u.name, line: u.line, tokens: u.tokens, module });
  }
  return out;
}

/** Declarations in an app file that look like a kit one, the most alike kit declaration for each. */
export function findReuse(source: string, kit: KitUnit[], threshold = THRESHOLD): Reuse[] {
  const out: Reuse[] = [];
  for (const u of units(source)) {
    if (u.allowed || u.tokens.length < MIN_TOKENS) continue;
    let best: { unit: KitUnit; score: number } | null = null;
    for (const k of kit) {
      // A much longer or shorter declaration can't be a copy; skip the work.
      const ratio = u.tokens.length / k.tokens.length;
      if (ratio < 0.5 || ratio > 2) continue;
      const score = similarity(u.tokens, k.tokens);
      if (!best || score > best.score) best = { unit: k, score };
    }
    if (best && best.score >= threshold) out.push({ line: u.line, name: u.name, kit: { name: best.unit.name, module: best.unit.module }, similarity: best.score });
  }
  return out;
}
