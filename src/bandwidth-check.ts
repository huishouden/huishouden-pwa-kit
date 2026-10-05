// The rule behind `pwa-bandwidth-check` (docs/one-site.md "Bandwidth"): no workflow step opens
// production in a browser. A step runs a browser when it calls Playwright or an app's e2e or
// screenshots script; it must set BASE_URL (step, job or workflow env, or inline), or say
// `# pwa-bandwidth-check: local` when its config only uses localhost, and nothing it sees may name
// the production site.

export interface BandwidthFinding {
  job: string;
  step: string;
  reason: string;
}

const BROWSER = /\bplaywright\s+test\b|\b(bun|npm|pnpm|yarn)\s+run\s+(e2e|screenshots)(:[\w-]+)?\b|\"(bun|npm) run (e2e|screenshots)(:[\w-]+)?\"/;
const PRODUCTION = /huishouden-piekstra\.(web\.app|firebaseapp\.com)|\bLIVE_URL\b|inputs\.site-url|\bSUITE_ORIGIN\b/;
const SETS_BASE_URL = /(^|[\s;(])(export\s+)?BASE_URL=/m;

type Env = Record<string, unknown> | undefined;
const envText = (...envs: Env[]) =>
  envs
    .filter(Boolean)
    .flatMap((e) => Object.entries(e as Record<string, unknown>).map(([k, v]) => `${k}=${String(v)}`))
    .join('\n');
const hasBaseUrl = (...envs: Env[]) => envs.some((e) => !!e && Object.prototype.hasOwnProperty.call(e, 'BASE_URL'));

export function bandwidthFindings(workflow: unknown): BandwidthFinding[] {
  const wf = (workflow ?? {}) as { env?: Env; jobs?: Record<string, { env?: Env; steps?: unknown[] }> };
  const out: BandwidthFinding[] = [];
  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    for (const [i, raw] of (job?.steps ?? []).entries()) {
      const step = raw as { name?: string; run?: string; env?: Env };
      if (typeof step?.run !== 'string') continue;
      // Commands only: a comment that mentions Playwright isn't a browser.
      const commands = step.run
        .split('\n')
        .filter((l) => !/^\s*#/.test(l))
        .join('\n');
      if (!BROWSER.test(commands)) continue;
      // A script whose config never leaves the machine (localhost ports, an emulator, no browser at
      // all) says so in a comment line of the step: `# pwa-bandwidth-check: local`.
      if (/^\s*#\s*pwa-bandwidth-check:\s*local\b/m.test(step.run)) continue;
      const name = step.name ?? `step ${i + 1}`;
      const seen = `${commands}\n${envText(wf.env, job.env, step.env)}`;
      if (PRODUCTION.test(seen)) out.push({ job: jobName, step: name, reason: 'runs a browser and names the production site' });
      else if (!hasBaseUrl(wf.env, job.env, step.env) && !SETS_BASE_URL.test(commands))
        out.push({ job: jobName, step: name, reason: 'runs a browser without BASE_URL (a Playwright config may default to production)' });
    }
  }
  return out;
}
