#!/usr/bin/env bun
// Usage: pwa-bandwidth-check [dirs or files...]   (default: .github/workflows)
// Fails when a workflow step runs a browser (Playwright, the e2e or screenshots scripts) against
// production, or without saying where: the apps' Playwright configs used to default to production.
// Production Hosting is on Firebase's free plan, 10 GB a month for the whole suite, and a browser
// visit downloads the app's whole precache (docs/one-site.md "Bandwidth").
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bandwidthFindings } from '../src/bandwidth-check';

const args = process.argv.slice(2);
const targets = args.length ? args : ['.github/workflows'];
const files: string[] = [];
for (const t of targets) {
  if (!existsSync(t)) continue;
  if (statSync(t).isDirectory()) {
    for (const f of readdirSync(t)) if (/\.ya?ml$/.test(f)) files.push(join(t, f));
  } else files.push(t);
}

let failed = 0;
for (const file of files) {
  let doc: unknown;
  try {
    doc = Bun.YAML.parse(readFileSync(file, 'utf8'));
  } catch {
    continue; // templates with placeholders may not parse; the YAML check elsewhere covers real workflows
  }
  for (const f of bandwidthFindings(doc)) {
    failed++;
    console.log(`::error file=${file},title=Browser against production::${f.job} / ${f.step}: ${f.reason}`);
  }
}
if (failed) {
  console.log(`${failed} step(s) would load production in a browser. Run browser tests on staging or a local preview (BASE_URL), never production (docs/one-site.md "Bandwidth").`);
  process.exit(1);
}
console.log(`pwa-bandwidth-check: ${files.length} workflow file(s), no browser against production`);
