#!/usr/bin/env bun
// Usage: pwa-design-check [paths...]   (default: src index.html). Exit 1 when anything breaks
// the Huishouden design language's mechanical rules; see DESIGN.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkSource, kindOf } from '../src/design-check';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'index.html'];
const files: string[] = [];
const walk = (p: string) => {
  try {
    if (statSync(p).isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
    else files.push(p);
  } catch {}
};
roots.forEach(walk);

let count = 0;
for (const file of files) {
  const kind = kindOf(file);
  if (!kind) continue;
  for (const f of checkSource(readFileSync(file, 'utf8'), kind)) {
    count++;
    console.log(`${file}:${f.line}: ${f.rule}: ${f.text}`);
  }
}
if (count) {
  console.log(`\n${count} design-language violation(s). Rules: https://github.com/piekstra/pwa-kit/blob/main/DESIGN.md`);
  process.exit(1);
}
console.log(`design check: ${files.filter((f) => kindOf(f)).length} files follow the Huishouden design language`);
