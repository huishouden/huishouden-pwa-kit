#!/usr/bin/env bun
// Usage: pwa-headers-check [firebase.json]. Exit 1 when the site's own pages lack the security
// headers (STANDARD.md "Security headers") or a Firebase /__/ path would be frame-denied. A repo
// that serves no pages (a Worker such as huishouden/notify: no firebase.json, or a wrangler.toml
// beside one without `hosting`) has nothing to check.
import { existsSync, readFileSync } from 'node:fs';
import { APP_PATHS_REGEX, checkSecurityHeaders } from '../src/security-headers';

const file = process.argv[2] ?? 'firebase.json';
if (!process.argv[2] && !existsSync(file)) {
  console.log('headers check: no firebase.json, so no pages to check');
  process.exit(0);
}
let config: unknown;
try {
  config = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.log(`headers check: can't read ${file}: ${(e as Error).message}`);
  process.exit(2);
}
if (!(config as { hosting?: unknown })?.hosting) {
  // A Worker's emulator-only firebase.json (huishouden/connector): no pages. Anywhere else a
  // missing hosting block is a mistake, never a reason to skip the check.
  if (existsSync('wrangler.toml')) {
    console.log(`headers check: ${file} has no hosting and this is a Worker (wrangler.toml), so no pages to check`);
    process.exit(0);
  }
  console.error(`headers check: ${file} has no hosting section`);
  process.exit(1);
}
const problems = checkSecurityHeaders(config);
if (problems.length) {
  for (const p of problems) console.log(`${file}: ${p}`);
  console.log(`\nAdd a hosting.headers rule with "regex": "${APP_PATHS_REGEX}" and the headers in @huishouden/pwa-kit templates/firebase.json.`);
  process.exit(1);
}
console.log(`headers check: ${file} sends the security headers on app paths and leaves /__/ alone`);
