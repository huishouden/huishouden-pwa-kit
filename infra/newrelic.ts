#!/usr/bin/env bun
/**
 * Sets up New Relic (free tier) for a family of apps: one Browser application per app, the
 * VITE_NEWRELIC_* repo variables, an uptime check per site, alert conditions with an email
 * destination, drop rules that keep geography coarse, and one dashboard. Safe to re-run: everything
 * is found by name and updated rather than duplicated. STANDARD.md "Observability".
 *
 *   NEW_RELIC_API_KEY=… NEW_RELIC_ACCOUNT_ID=… ALERT_EMAIL=… bun infra/newrelic.ts apps.json
 *
 * apps.json is the portal's list: [{ "repo": "baby", "site": "huishouden-baby" }, …].
 * Optional: GITHUB_OWNER (default huishouden), FAMILY (default Huishouden), DRY_RUN=1.
 * Needs a New Relic user key (NRAK-…, never committed) and `gh` signed in with admin on the repos.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const KEY = process.env.NEW_RELIC_API_KEY;
const ACCOUNT = Number(process.env.NEW_RELIC_ACCOUNT_ID);
const EMAIL = process.env.ALERT_EMAIL;
const OWNER = process.env.GITHUB_OWNER ?? 'huishouden';
const FAMILY = process.env.FAMILY ?? 'Huishouden';
const DRY = process.env.DRY_RUN === '1';
const file = process.argv[2];
if (!KEY || !ACCOUNT || !EMAIL || !file) {
  console.error('Usage: NEW_RELIC_API_KEY=… NEW_RELIC_ACCOUNT_ID=… ALERT_EMAIL=… bun infra/newrelic.ts apps.json');
  process.exit(2);
}

interface AppEntry {
  repo: string;
  site: string;
}
const apps = (JSON.parse(readFileSync(file, 'utf8')) as AppEntry[]).filter((a) => a.repo && a.site);
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const browserName = (a: AppEntry) => `${FAMILY} ${title(a.repo)}`;
const siteUrl = (a: AppEntry) => `https://${a.site}.web.app/`;

async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('https://api.newrelic.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-Key': KEY! },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data as T;
}

const mutate = async <T = any>(what: string, query: string, variables: Record<string, unknown>): Promise<T | null> => {
  console.log(`${DRY ? '[dry run] ' : ''}${what}`);
  return DRY ? null : gql<T>(query, variables);
};

async function entities(query: string): Promise<{ guid: string; name: string; applicationId?: number; monitorId?: string }[]> {
  const d = await gql(
    `query($q: String!) { actor { entitySearch(query: $q) { results { entities { guid name
      ... on BrowserApplicationEntityOutline { applicationId }
      ... on SyntheticMonitorEntityOutline { monitorId } } } } } }`,
    { q: query },
  );
  return d.actor.entitySearch.results.entities;
}

// 1. Browser applications and the repo variables the build reads.
async function browserApps() {
  const existing = await entities(`domain = 'BROWSER' AND type = 'APPLICATION' AND name LIKE '${FAMILY} %' AND accountId = ${ACCOUNT}`);
  for (const app of apps) {
    let guid = existing.find((e) => e.name === browserName(app))?.guid;
    if (!guid) {
      const made = await mutate(`create Browser app ${browserName(app)}`,
        `mutation($a: Int!, $n: String!) { agentApplicationCreateBrowser(accountId: $a, name: $n, settings: { cookiesEnabled: true, distributedTracingEnabled: false, loaderType: SPA }) { guid } }`,
        { a: ACCOUNT, n: browserName(app) });
      guid = made?.agentApplicationCreateBrowser.guid;
    }
    if (!guid) continue;
    const d = await gql(`query($g: EntityGuid!) { actor { entity(guid: $g) { ... on BrowserApplicationEntity { browserProperties { jsConfig } } } } }`, { g: guid });
    const cfg = d.actor.entity.browserProperties.jsConfig.loader_config as { accountID: string; applicationID: string; licenseKey: string };
    const vars = { VITE_NEWRELIC_ACCOUNT_ID: String(cfg.accountID), VITE_NEWRELIC_APP_ID: String(cfg.applicationID), VITE_NEWRELIC_BROWSER_KEY: cfg.licenseKey };
    for (const [name, value] of Object.entries(vars)) {
      console.log(`${DRY ? '[dry run] ' : ''}gh variable set ${name} --repo ${OWNER}/${app.repo}`);
      if (!DRY) {
        const r = spawnSync('gh', ['variable', 'set', name, '--repo', `${OWNER}/${app.repo}`, '--body', value], { stdio: ['ignore', 'ignore', 'inherit'] });
        if (r.status !== 0) throw new Error(`gh variable set ${name} failed for ${app.repo}`);
      }
    }
  }
}

// 2. Uptime: ping monitors are free and unlimited on every plan (other monitor types count against 500 checks a month).
async function uptime() {
  const existing = await entities(`domain = 'SYNTH' AND type = 'MONITOR' AND name LIKE '${FAMILY} %' AND accountId = ${ACCOUNT}`);
  for (const app of apps) {
    const name = `${browserName(app)} up`;
    const monitor = {
      name,
      uri: siteUrl(app),
      period: 'EVERY_15_MINUTES',
      status: 'ENABLED',
      locations: { public: ['AWS_US_EAST_1', 'AWS_US_WEST_1'] },
      advancedOptions: { responseValidationText: FAMILY, useTlsValidation: true, redirectIsFailure: false, shouldBypassHeadRequest: true },
    };
    const found = existing.find((e) => e.name === name);
    if (found)
      await mutate(`update monitor ${name}`, `mutation($g: EntityGuid!, $m: SyntheticsUpdateSimpleMonitorInput!) { syntheticsUpdateSimpleMonitor(guid: $g, monitor: $m) { errors { description } } }`, { g: found.guid, m: monitor });
    else
      await mutate(`create monitor ${name}`, `mutation($a: Int!, $m: SyntheticsCreateSimpleMonitorInput!) { syntheticsCreateSimpleMonitor(accountId: $a, monitor: $m) { errors { description } } }`, { a: ACCOUNT, m: monitor });
  }
}

// 3. New Relic works out the city from the connection; keep only country and region.
async function dropRules() {
  const d = await gql(`query($a: Int!) { actor { account(id: $a) { nrqlDropRules { list { rules { nrql } } } } } }`, { a: ACCOUNT });
  const have = new Set<string>((d.actor.account.nrqlDropRules.list.rules ?? []).map((r: { nrql: string }) => r.nrql));
  const rules = ['PageView', 'PageViewTiming', 'PageAction', 'JavaScriptError', 'BrowserPerformance']
    .map((t) => `SELECT city, asnLatitude, asnLongitude FROM ${t} WHERE appName LIKE '${FAMILY} %'`)
    .filter((nrql) => !have.has(nrql));
  if (rules.length)
    await mutate(`drop city and coordinates (${rules.length} event types)`,
      `mutation($a: Int!, $r: [NrqlDropRulesCreateDropRuleInput!]!) { nrqlDropRulesCreate(accountId: $a, rules: $r) { failures { error { description } } } }`,
      { a: ACCOUNT, r: rules.map((nrql) => ({ action: 'DROP_ATTRIBUTES', nrql, description: `${FAMILY}: coarse geography only (STANDARD.md Observability)` })) });
}

// 4. Alerts, emailed.
interface Condition {
  name: string;
  description: string;
  query: string;
  operator: 'ABOVE' | 'BELOW' | 'ABOVE_OR_EQUALS';
  threshold: number;
  window: number;
  duration: number;
  expiration?: { expirationDuration: number; openViolationOnExpiration: boolean; closeViolationsOnExpiration: boolean };
  /** A steady signal (a heartbeat) is aggregated as it streams; sparse ones (errors) on a timer. */
  steady?: boolean;
}

const CONDITIONS: Condition[] = [
  {
    name: 'App errors spike',
    description: 'More than 10 JavaScript or handled errors in an app within 30 minutes (one incident per app). Open the dashboard Errors page and filter by app.',
    query: `SELECT count(*) FROM JavaScriptError WHERE appName LIKE '${FAMILY} %' FACET appName`,
    operator: 'ABOVE', threshold: 10, window: 1800, duration: 1800,
  },
  {
    name: 'Site down',
    description: 'A site failed its uptime check twice in a row (checked every 15 minutes from two locations).',
    query: `SELECT filter(count(*), WHERE result = 'FAILED') FROM SyntheticCheck WHERE monitorName LIKE '${FAMILY} %' FACET monitorName`,
    operator: 'ABOVE_OR_EQUALS', threshold: 2, window: 1800, duration: 1800,
  },
  {
    name: 'Notify sender silent',
    description: 'The notify Worker reported no run for 20 minutes (it runs every 5): reminders are not being sent. Check `bunx wrangler tail` in huishouden/notify.',
    query: `SELECT count(*) FROM NotifyRun`,
    operator: 'BELOW', threshold: 1, window: 600, duration: 1200,
    expiration: { expirationDuration: 1200, openViolationOnExpiration: true, closeViolationsOnExpiration: false },
    steady: true,
  },
  {
    name: 'Notify run crashed',
    description: 'A notify Worker run threw before finishing (the error is on the NotifyRun event). Check `bunx wrangler tail` in huishouden/notify.',
    query: `SELECT filter(count(*), WHERE error IS NOT NULL) FROM NotifyRun`,
    operator: 'ABOVE_OR_EQUALS', threshold: 1, window: 1800, duration: 1800,
  },
  {
    name: 'Push deliveries failing',
    description: 'More than 5 Web Push deliveries failed in an hour (push service errors other than gone subscriptions).',
    query: `SELECT sum(failed) FROM NotifyRun`,
    operator: 'ABOVE', threshold: 5, window: 3600, duration: 3600,
  },
];

async function alerts(): Promise<string | null> {
  const policyName = FAMILY;
  const p = await gql(`query($a: Int!, $n: String!) { actor { account(id: $a) { alerts { policiesSearch(searchCriteria: { name: $n }) { policies { id name } } } } } }`, { a: ACCOUNT, n: policyName });
  let policyId: string | undefined = p.actor.account.alerts.policiesSearch.policies.find((x: { name: string }) => x.name === policyName)?.id;
  if (!policyId) {
    const made = await mutate(`create alert policy ${policyName}`, `mutation($a: Int!, $p: AlertsPolicyInput!) { alertsPolicyCreate(accountId: $a, policy: $p) { id } }`,
      { a: ACCOUNT, p: { name: policyName, incidentPreference: 'PER_CONDITION_AND_TARGET' } });
    policyId = made?.alertsPolicyCreate.id;
  }
  if (!policyId) return null;

  const c = await gql(`query($a: Int!, $p: ID!) { actor { account(id: $a) { alerts { nrqlConditionsSearch(searchCriteria: { policyId: $p }) { nrqlConditions { id name } } } } } }`, { a: ACCOUNT, p: policyId });
  const have: { id: string; name: string }[] = c.actor.account.alerts.nrqlConditionsSearch.nrqlConditions;
  for (const cond of CONDITIONS) {
    const input = {
      name: cond.name,
      description: cond.description,
      enabled: true,
      nrql: { query: cond.query },
      signal: cond.steady
        ? { aggregationWindow: cond.window, aggregationMethod: 'EVENT_FLOW', aggregationDelay: 120, fillOption: 'STATIC', fillValue: 0 }
        : { aggregationWindow: cond.window, aggregationMethod: 'EVENT_TIMER', aggregationTimer: 120, fillOption: 'NONE' },
      terms: [{ operator: cond.operator, threshold: cond.threshold, thresholdDuration: cond.duration, thresholdOccurrences: 'ALL', priority: 'CRITICAL' }],
      valueFunction: 'SINGLE_VALUE',
      violationTimeLimitSeconds: 86400,
      ...(cond.expiration ? { expiration: cond.expiration } : {}),
    };
    const found = have.find((x) => x.name === cond.name);
    if (found)
      await mutate(`update condition ${cond.name}`, `mutation($a: Int!, $id: ID!, $c: AlertsNrqlConditionUpdateStaticInput!) { alertsNrqlConditionStaticUpdate(accountId: $a, id: $id, condition: $c) { id } }`, { a: ACCOUNT, id: found.id, c: input });
    else
      await mutate(`create condition ${cond.name}`, `mutation($a: Int!, $p: ID!, $c: AlertsNrqlConditionStaticInput!) { alertsNrqlConditionStaticCreate(accountId: $a, policyId: $p, condition: $c) { id } }`, { a: ACCOUNT, p: policyId, c: input });
  }

  // Email destination, channel and workflow.
  const destName = `${FAMILY} alerts email`;
  const ds = await gql(`query($a: Int!, $n: String!) { actor { account(id: $a) { aiNotifications { destinations(filters: { name: $n }) { entities { id name active status } } } } } }`, { a: ACCOUNT, n: destName });
  let dest = ds.actor.account.aiNotifications.destinations.entities.find((x: { name: string }) => x.name === destName);
  if (!dest) {
    const made = await mutate(`create email destination ${destName}`,
      `mutation($a: Int!, $d: AiNotificationsDestinationInput!) { aiNotificationsCreateDestination(accountId: $a, destination: $d) { destination { id active status } error { ... on AiNotificationsResponseError { description } } } }`,
      { a: ACCOUNT, d: { type: 'EMAIL', name: destName, properties: [{ key: 'email', value: EMAIL }] } });
    dest = made?.aiNotificationsCreateDestination.destination;
  }
  if (!dest) return policyId;
  if (dest.status && dest.status !== 'DEFAULT') console.log(`  destination status: ${dest.status} (an address outside the account may need to confirm a verification email)`);

  const chName = `${FAMILY} alerts email`;
  const cs = await gql(`query($a: Int!, $n: String!) { actor { account(id: $a) { aiNotifications { channels(filters: { name: $n }) { entities { id name } } } } } }`, { a: ACCOUNT, n: chName });
  let channelId: string | undefined = cs.actor.account.aiNotifications.channels.entities.find((x: { name: string }) => x.name === chName)?.id;
  if (!channelId) {
    const made = await mutate(`create email channel ${chName}`,
      `mutation($a: Int!, $c: AiNotificationsChannelInput!) { aiNotificationsCreateChannel(accountId: $a, channel: $c) { channel { id } error { ... on AiNotificationsResponseError { description } } } }`,
      { a: ACCOUNT, c: { type: 'EMAIL', name: chName, destinationId: dest.id, product: 'IINT', properties: [{ key: 'subject', value: `[${FAMILY}] {{ issueTitle }}` }] } });
    channelId = made?.aiNotificationsCreateChannel.channel?.id;
  }
  if (!channelId) return policyId;

  const wfName = `${FAMILY} alerts`;
  const ws = await gql(`query($a: Int!, $n: String!) { actor { account(id: $a) { aiWorkflows { workflows(filters: { name: $n }) { entities { id name } } } } } }`, { a: ACCOUNT, n: wfName });
  if (!ws.actor.account.aiWorkflows.workflows.entities.some((x: { name: string }) => x.name === wfName))
    await mutate(`create workflow ${wfName}`,
      `mutation($a: Int!, $w: AiWorkflowsCreateWorkflowInput!) { aiWorkflowsCreateWorkflow(accountId: $a, createWorkflowData: $w) { workflow { id } errors { description } } }`,
      {
        a: ACCOUNT,
        w: {
          name: wfName,
          workflowEnabled: true,
          destinationsEnabled: true,
          mutingRulesHandling: 'NOTIFY_ALL_ISSUES',
          issuesFilter: { name: wfName, type: 'FILTER', predicates: [{ attribute: 'labels.policyIds', operator: 'EXACTLY_MATCHES', values: [policyId] }] },
          destinationConfigurations: [{ channelId, notificationTriggers: ['ACTIVATED', 'CLOSED'] }],
        },
      });
  return policyId;
}

// 5. One dashboard for the family.
const W = (title: string, viz: string, query: string, column: number, row: number, width = 4, height = 3) => ({
  title,
  visualization: { id: viz },
  layout: { column, row, width, height },
  rawConfiguration: { nrqlQueries: [{ accountIds: [ACCOUNT], query }], ...(viz === 'viz.line' ? { legend: { enabled: true } } : {}) },
});
const APPS_WHERE = `appName LIKE '${FAMILY} %'`;
const SHORT = `capture(appName, r'${FAMILY} (?P<app>.*)')`;

function dashboard() {
  return {
    name: FAMILY,
    description: `Errors, Core Web Vitals, usage and uptime for every ${FAMILY} app (pwa-kit infra/newrelic.ts).`,
    permissions: 'PUBLIC_READ_ONLY',
    pages: [
      {
        name: 'Overview',
        widgets: [
          W('Page views by app', 'viz.line', `SELECT count(*) FROM PageView WHERE ${APPS_WHERE} FACET ${SHORT} TIMESERIES AUTO SINCE 1 week ago`, 1, 1, 8),
          W('Errors by app', 'viz.bar', `SELECT count(*) FROM JavaScriptError WHERE ${APPS_WHERE} FACET ${SHORT} SINCE 1 week ago`, 9, 1),
          W('Page views', 'viz.billboard', `SELECT count(*) AS 'Page views' FROM PageView WHERE ${APPS_WHERE} SINCE 1 week ago COMPARE WITH 1 week ago`, 1, 4),
          W('Active households (hashed)', 'viz.billboard', `SELECT uniqueCount(household) AS 'Households' FROM PageView, PageAction WHERE ${APPS_WHERE} SINCE 1 week ago COMPARE WITH 1 week ago`, 5, 4),
          W('Error rate (errors per 100 page views)', 'viz.billboard', `SELECT 100 * filter(count(*), WHERE eventType() = 'JavaScriptError') / filter(count(*), WHERE eventType() = 'PageView') AS 'Errors per 100 views' FROM JavaScriptError, PageView WHERE ${APPS_WHERE} SINCE 1 day ago`, 9, 4),
          W('Countries', 'viz.bar', `SELECT count(*) FROM PageView WHERE ${APPS_WHERE} FACET countryCode SINCE 1 month ago`, 1, 7),
          W('Regions', 'viz.table', `SELECT count(*) AS 'Page views' FROM PageView WHERE ${APPS_WHERE} FACET countryCode, regionCode SINCE 1 month ago LIMIT 50`, 5, 7),
          W('Devices', 'viz.pie', `SELECT count(*) FROM PageView WHERE ${APPS_WHERE} FACET deviceType SINCE 1 month ago`, 9, 7),
          W('Uptime checks', 'viz.table', `SELECT percentage(count(*), WHERE result = 'SUCCESS') AS 'Up %', average(duration) AS 'ms', latest(result) AS 'Last' FROM SyntheticCheck WHERE monitorName LIKE '${FAMILY} %' FACET monitorName SINCE 1 day ago`, 1, 10, 6),
          W('Notify sender runs', 'viz.line', `SELECT count(*) AS 'Runs', sum(pushed) AS 'Pushed', sum(failed) AS 'Failed', filter(count(*), WHERE error IS NOT NULL) AS 'Crashed' FROM NotifyRun TIMESERIES 1 hour SINCE 1 day ago`, 7, 10, 6),
        ],
      },
      {
        name: 'Errors',
        widgets: [
          W('Errors over time', 'viz.line', `SELECT count(*) FROM JavaScriptError WHERE ${APPS_WHERE} FACET ${SHORT} TIMESERIES AUTO SINCE 1 week ago`, 1, 1, 12),
          W('Top errors', 'viz.table', `SELECT count(*) AS 'Count', latest(\`application.version\`) AS 'Version', latest(timestamp) AS 'Last seen' FROM JavaScriptError WHERE ${APPS_WHERE} FACET ${SHORT}, errorMessage, \`where\` SINCE 1 week ago LIMIT 50`, 1, 4, 12, 4),
          W('Errors by version', 'viz.bar', `SELECT count(*) FROM JavaScriptError WHERE ${APPS_WHERE} FACET ${SHORT}, \`application.version\` SINCE 1 week ago`, 1, 8, 6),
          W('Handled failures by code', 'viz.bar', `SELECT count(*) FROM JavaScriptError WHERE ${APPS_WHERE} AND handled IS TRUE FACET code, status SINCE 1 week ago`, 7, 8, 6),
        ],
      },
      {
        name: 'Core Web Vitals',
        widgets: [
          W('LCP p75 (ms, good < 2500)', 'viz.bar', `SELECT percentile(largestContentfulPaint, 75) * 1000 FROM PageViewTiming WHERE ${APPS_WHERE} AND timingName = 'largestContentfulPaint' FACET ${SHORT} SINCE 1 week ago`, 1, 1),
          W('INP p75 (ms, good < 200)', 'viz.bar', `SELECT percentile(interactionToNextPaint, 75) FROM PageViewTiming WHERE ${APPS_WHERE} AND timingName = 'interactionToNextPaint' FACET ${SHORT} SINCE 1 week ago`, 5, 1),
          W('CLS p75 (good < 0.1)', 'viz.bar', `SELECT percentile(cumulativeLayoutShift, 75) FROM PageViewTiming WHERE ${APPS_WHERE} AND timingName IN ('pageHide', 'windowUnload') FACET ${SHORT} SINCE 1 week ago`, 9, 1),
          W('LCP p75 over time', 'viz.line', `SELECT percentile(largestContentfulPaint, 75) * 1000 FROM PageViewTiming WHERE ${APPS_WHERE} AND timingName = 'largestContentfulPaint' FACET ${SHORT} TIMESERIES 1 day SINCE 1 month ago`, 1, 4, 12),
          W('Load time by device (s)', 'viz.table', `SELECT percentile(duration, 50, 75) FROM PageView WHERE ${APPS_WHERE} FACET ${SHORT}, deviceType SINCE 1 week ago`, 1, 7, 12),
        ],
      },
      {
        name: 'Usage',
        widgets: [
          W('Feature use', 'viz.bar', `SELECT count(*) FROM PageAction WHERE ${APPS_WHERE} AND actionName != 'view' FACET ${SHORT}, actionName SINCE 1 week ago LIMIT 50`, 1, 1, 6, 4),
          W('Screens and tabs', 'viz.bar', `SELECT count(*) FROM PageAction WHERE ${APPS_WHERE} AND actionName = 'view' FACET ${SHORT}, view SINCE 1 week ago LIMIT 50`, 7, 1, 6, 4),
          W('Households per app (hashed)', 'viz.bar', `SELECT uniqueCount(household) FROM PageView WHERE ${APPS_WHERE} FACET ${SHORT} SINCE 1 week ago`, 1, 5, 6),
          W('Page views per day', 'viz.line', `SELECT count(*) FROM PageView WHERE ${APPS_WHERE} FACET ${SHORT} TIMESERIES 1 day SINCE 1 month ago`, 7, 5, 6),
          W('Versions in use', 'viz.table', `SELECT count(*) AS 'Page views' FROM PageView WHERE ${APPS_WHERE} FACET ${SHORT}, \`application.version\` SINCE 1 day ago`, 1, 8, 12),
        ],
      },
    ],
  };
}

async function upsertDashboard() {
  const found = await entities(`type = 'DASHBOARD' AND name = '${FAMILY}' AND accountId = ${ACCOUNT}`);
  const guid = found.find((e) => e.name === FAMILY)?.guid;
  const d = dashboard();
  if (guid) {
    await mutate(`update dashboard ${FAMILY}`, `mutation($g: EntityGuid!, $d: DashboardInput!) { dashboardUpdate(guid: $g, dashboard: $d) { errors { description } } }`, { g: guid, d });
    return guid;
  }
  const made = await mutate(`create dashboard ${FAMILY}`, `mutation($a: Int!, $d: DashboardInput!) { dashboardCreate(accountId: $a, dashboard: $d) { entityResult { guid } errors { description } } }`, { a: ACCOUNT, d });
  if (made?.dashboardCreate.errors?.length) throw new Error(made.dashboardCreate.errors.map((e: { description: string }) => e.description).join('; '));
  return made?.dashboardCreate.entityResult?.guid ?? null;
}

await browserApps();
await uptime();
await dropRules();
const policyId = await alerts();
const dash = await upsertDashboard();
console.log(`\nAlert policy ${policyId ?? '(dry run)'}; dashboard https://one.newrelic.com/redirect/entity/${dash ?? '(dry run)'}`);
