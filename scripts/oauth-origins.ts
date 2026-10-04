#!/usr/bin/env bun
// pwa-oauth-origins <client-id> --project=<id> [--site=<suite site>] [<origin>...]
// Without origins, checks the ones the project needs (signInOrigins: the site that serves the suite,
// default the project's default site, and <project>.firebaseapp.com). Exits 1 and says what to add
// when any is missing.
import { missingOriginMessage, originStatus, signInOrigins } from '../src/oauth-origins';

const args = process.argv.slice(2);
const project = args.find((a) => a.startsWith('--project='))?.split('=')[1];
const site = args.find((a) => a.startsWith('--site='))?.split('=')[1] || undefined;
const [clientId, ...given] = args.filter((a) => !a.startsWith('--'));
const origins = given.length ? given : project ? signInOrigins(project, site) : [];
if (!clientId || origins.length === 0) {
  console.error('usage: pwa-oauth-origins <client-id> --project=<id> [--site=<suite site>] [<origin>...]');
  process.exit(2);
}
const results = await Promise.all(origins.map(async (o) => [o, await originStatus(clientId, o)] as const));
for (const [o, s] of results) console.log(`${s.padEnd(10)} ${o}`);
const missing = results.filter(([, s]) => s === 'missing').map(([o]) => o);
if (missing.length) {
  console.error(`\n${missingOriginMessage(missing, project)}`);
  process.exit(1);
}
