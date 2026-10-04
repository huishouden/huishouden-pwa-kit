#!/usr/bin/env bun
// Usage: pwa-i18n-check [--strict] [src]   Checks the app's translations (docs/i18n.md):
//   errors (exit 1): src/locales/es.json or nl.json missing a key en.json has, or having one it
//     doesn't; a message that doesn't parse or whose {variables} differ from the English; a key no
//     code uses (mark keys built at run time with a comment `i18n-dynamic: prefix.`).
//   warnings: English literals in JSX text and text attributes, and in notify()/fail() calls;
//     a translation identical to its English. `--strict` makes the literals errors.
// An app without src/locales/en.json isn't translated yet: a notice, exit 0.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CHECK_LANGS, checkCatalogues, findJsxLiterals, findMessageLiterals, isCheckedSource, unusedKeys, type Problem } from '../src/i18n-check';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const root = args.find((a) => !a.startsWith('--')) ?? 'src';
const dir = join(root, 'locales');
const ci = !!process.env.GITHUB_ACTIONS;

const annotate = (level: 'error' | 'warning', p: Problem) => {
  if (ci) console.log(`::${level} file=${p.file}${p.line ? `,line=${p.line}` : ''}::${p.message}`);
  else console.log(`${p.file}${p.line ? `:${p.line}` : ''}: ${level}: ${p.message}`);
};

if (!existsSync(join(dir, 'en.json'))) {
  console.log(`i18n check: ${dir}/en.json not found, so this app isn't translated yet (docs/i18n.md in @huishouden/pwa-kit says how).`);
  process.exit(0);
}

const read = (file: string) => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : undefined);
let en: Record<string, unknown>;
const others: Record<string, Record<string, unknown> | undefined> = {};
try {
  en = read(join(dir, 'en.json'))!;
  for (const lang of CHECK_LANGS) others[lang] = read(join(dir, `${lang}.json`));
} catch (e) {
  console.log(`i18n check: a catalogue isn't valid JSON: ${(e as Error).message}`);
  process.exit(2);
}

const files: string[] = [];
const walk = (p: string) => {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) if (e !== 'node_modules') walk(join(p, e));
  } else if (isCheckedSource(p)) files.push(p);
};
walk(root);
const sources = files.map((f) => ({ file: relative('.', f), text: readFileSync(f, 'utf8') }));

const { errors, warnings } = checkCatalogues(en, others, dir);
for (const key of unusedKeys(Object.keys(en), sources.map((s) => s.text))) errors.push({ file: join(dir, 'en.json'), message: `"${key}" is never used (delete it from every catalogue, or mark a run-time prefix with i18n-dynamic:)` });

const literals: Problem[] = [];
for (const { file, text } of sources) {
  const found = [...(file.endsWith('.tsx') ? findJsxLiterals(text) : []), ...findMessageLiterals(text)];
  for (const l of found) literals.push({ file, line: l.line, message: `English ${l.where === 'text' ? 'text' : l.where} not in t(): ${JSON.stringify(l.text)} (or mark the line i18n-ignore)` });
}

for (const p of errors) annotate('error', p);
for (const p of literals) annotate(strict ? 'error' : 'warning', p);
for (const p of warnings) annotate('warning', p);

const failed = errors.length + (strict ? literals.length : 0);
console.log(
  `\ni18n check: ${Object.keys(en).length} keys in ${['en', ...CHECK_LANGS].join('/')}, ${files.length} files; ${errors.length} error(s), ${literals.length} untranslated literal(s)${strict ? ' (strict)' : ''}, ${warnings.length} other warning(s)`,
);
process.exit(failed ? 1 : 0);
