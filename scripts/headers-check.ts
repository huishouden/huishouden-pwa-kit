#!/usr/bin/env bun
// Usage: pwa-headers-check [firebase.json]. Exit 1 when the site's own pages lack the security
// headers (STANDARD.md "Security headers") or a Firebase /__/ path would be frame-denied.
import { readFileSync } from 'node:fs';
import { APP_PATHS_REGEX, checkSecurityHeaders } from '../src/security-headers';

const file = process.argv[2] ?? 'firebase.json';
let config: unknown;
try {
  config = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.log(`headers check: can't read ${file}: ${(e as Error).message}`);
  process.exit(2);
}
const problems = checkSecurityHeaders(config);
if (problems.length) {
  for (const p of problems) console.log(`${file}: ${p}`);
  console.log(`\nAdd a hosting.headers rule with "regex": "${APP_PATHS_REGEX}" and the headers in @huishouden/pwa-kit templates/firebase.json.`);
  process.exit(1);
}
console.log(`headers check: ${file} sends the security headers on app paths and leaves /__/ alone`);
