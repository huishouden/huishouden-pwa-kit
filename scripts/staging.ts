#!/usr/bin/env bun
// pwa-staging seed
// Creates or resets the staging test users and their household (src/staging.ts). Run by the
// reusable workflow's staging job with the staging service account's access token in
// HH_STAGING_ACCESS_TOKEN; refuses any project but huishouden-staging.
import { STAGING_PROJECT, TEST_HOUSEHOLD, TEST_USERS, seedTestHousehold } from '../src/staging';

const [command] = process.argv.slice(2);
if (command !== 'seed') {
  console.error('usage: pwa-staging seed   (needs HH_STAGING_ACCESS_TOKEN)');
  process.exit(2);
}
const accessToken = process.env.HH_STAGING_ACCESS_TOKEN;
if (!accessToken) {
  console.error('HH_STAGING_ACCESS_TOKEN is not set');
  process.exit(2);
}
const projectId = process.env.HH_STAGING_PROJECT || STAGING_PROJECT;
await seedTestHousehold({ accessToken, projectId });
console.log(`seeded ${projectId}: households/${TEST_HOUSEHOLD.id} with ${TEST_USERS.map((u) => u.email).join(', ')}`);
