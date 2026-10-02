#!/usr/bin/env bun
// pwa-oauth-origins <client-id> <origin>... [--project=<id>]
// Exits 1 and says what to add when any origin is not registered on the OAuth web client.
import { missingOriginMessage, originStatus } from '../src/oauth-origins';

const args = process.argv.slice(2);
const project = args.find((a) => a.startsWith('--project='))?.split('=')[1];
const [clientId, ...origins] = args.filter((a) => !a.startsWith('--'));
if (!clientId || origins.length === 0) {
  console.error('usage: pwa-oauth-origins <client-id> <origin>... [--project=<id>]');
  process.exit(2);
}
const results = await Promise.all(origins.map(async (o) => [o, await originStatus(clientId, o)] as const));
for (const [o, s] of results) console.log(`${s.padEnd(10)} ${o}`);
const missing = results.filter(([, s]) => s === 'missing').map(([o]) => o);
if (missing.length) {
  console.error(`\n${missingOriginMessage(missing, project)}`);
  process.exit(1);
}
