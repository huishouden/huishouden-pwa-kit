#!/usr/bin/env bun
// Usage: pwa-write-check [paths...]   (default: src). Exit 1 when app code imports a Firestore write
// function from firebase/firestore instead of @huishouden/pwa-kit/firestore.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findRawWrites, isAppSource } from '../src/write-check';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const files: string[] = [];
const walk = (p: string) => {
  if (statSync(p).isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
  else if (isAppSource(p)) files.push(p);
};
// A missing or unreadable path fails the check rather than passing it with nothing scanned.
try {
  roots.forEach(walk);
} catch (e) {
  console.log(`write check: can't read ${(e as NodeJS.ErrnoException).path ?? roots.join(' ')}: ${(e as Error).message}`);
  process.exit(2);
}

let count = 0;
for (const file of files) {
  for (const w of findRawWrites(readFileSync(file, 'utf8'))) {
    count++;
    const what = w.name === '*' ? 'everything (including writes) imported or exported' : w.name;
    console.log(`${file}:${w.line}: ${what} from firebase/firestore; take writes from @huishouden/pwa-kit/firestore`);
  }
}
if (count) {
  console.log(`\n${count} write(s) outside the outbox: a write made just before the app closes could be lost. See @huishouden/pwa-kit/firestore.`);
  process.exit(1);
}
console.log(`write check: ${files.length} files, no Firestore write outside @huishouden/pwa-kit/firestore`);
