#!/usr/bin/env bun
// pwa-staging <command>: the staging project's test data (src/staging.ts), for the kit's jobs.
// Staging commands need the staging service account's access token in HH_STAGING_ACCESS_TOKEN and
// refuse any project but huishouden-staging; HH_E2E_TARGET=emulator points them at the emulators.
//
//   quota     one read; fails with "staging quota exceeded — rerun after HH:00 UTC" when it is used up
//   seed      the run's own household and people (HH_STAGING_RUN); specs seed theirs, so CI doesn't
//   cleanup   removes the run's households and people (HH_STAGING_RUN)
//   sweep     removes what runs left behind that is over a day old, and the old shared fixture
import { StagingQuotaError, checkStagingQuota, cleanupTestRun, seedTestHousehold, sweepStaging, testRunId } from '../src/staging';

const [command] = process.argv.slice(2);
const commands = ['quota', 'seed', 'cleanup', 'sweep'];
if (!command || !commands.includes(command)) {
  console.error(`usage: pwa-staging ${commands.join('|')}   (needs HH_STAGING_ACCESS_TOKEN; cleanup and seed use HH_STAGING_RUN)`);
  process.exit(2);
}

const annotate = process.env.GITHUB_ACTIONS === 'true';

try {
  if (command === 'quota') {
    await checkStagingQuota();
    console.log('staging Firestore quota: available');
  } else if (command === 'seed') {
    const household = await seedTestHousehold();
    console.log(`seeded households/${household.id} with ${Object.values(household.users).map((u) => u.email).join(', ')}`);
  } else {
    const report = command === 'cleanup' ? await cleanupTestRun() : await sweepStaging();
    const what = command === 'cleanup' ? `run ${testRunId()}` : 'leftovers over a day old';
    console.log(`${command} (${what}): ${report.households.length} households (${report.documents} documents), ${report.users} users removed`);
    for (const id of report.households) console.log(`  households/${id}`);
  }
} catch (e) {
  if (e instanceof StagingQuotaError) {
    console.error(annotate ? `::error title=Staging quota exceeded::${e.message}` : e.message);
    process.exit(3);
  }
  throw e;
}
