#!/usr/bin/env bun
// Usage: pwa-reuse-check [--strict] [paths...]   (default: src). Lists app functions, hooks and
// components that are near copies of ones the kit exports. Warnings only (exit 0) unless --strict.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findReuse, kitUnits } from '../src/reuse-check';
import { isAppSource } from '../src/write-check';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const roots = args.filter((a) => a !== '--strict');
if (!roots.length) roots.push('src');

const walk = (p: string, out: string[]) => {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) if (e !== 'node_modules') walk(join(p, e), out);
  } else if (isAppSource(p)) out.push(p);
  return out;
};

const kitRoot = fileURLToPath(new URL('..', import.meta.url));
const kitPackage = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8')) as { name: string; exports: Record<string, unknown> };
const kitFiles = walk(join(kitRoot, 'src'), []).map((p) => ({ path: relative(kitRoot, p), source: readFileSync(p, 'utf8') }));
const kit = kitUnits(kitFiles, kitPackage.exports, kitPackage.name);

let files: string[];
try {
  files = roots.flatMap((r) => walk(r, []));
} catch (e) {
  console.log(`reuse check: can't read ${(e as NodeJS.ErrnoException).path ?? roots.join(' ')}: ${(e as Error).message}`);
  process.exit(2);
}

const annotate = process.env.GITHUB_ACTIONS === 'true';
let count = 0;
for (const file of files) {
  for (const r of findReuse(readFileSync(file, 'utf8'), kit)) {
    count++;
    const message = `${r.name} is ${Math.round(r.similarity * 100)}% alike ${r.kit.name} in ${r.kit.module}; import that instead (or mark it // reuse-check:allow <reason>)`;
    console.log(`${file}:${r.line}: ${message}`);
    if (annotate) console.log(`::warning file=${file},line=${r.line},title=Kit already has this::${message}`);
  }
}
if (count) {
  console.log(`\n${count} near cop${count === 1 ? 'y' : 'ies'} of kit code: copies drift. See STANDARD.md "Shared code".`);
  if (strict) process.exit(1);
} else console.log(`reuse check: ${files.length} files, nothing the kit (${kit.length} declarations) already has`);
