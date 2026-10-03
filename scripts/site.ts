#!/usr/bin/env bun
// pwa-site: the suite's one site (docs/one-site.md). Runs in the reusable workflow; needs only bun,
// tar and network access to GitHub (GH_TOKEN, when set, only raises the API rate limit: every
// repo is public).
//
//   pwa-site pack <dist> <out.tar.gz> --path /pet/        stamp a build and pack it for a release asset
//   pwa-site assemble --flavor production|staging --out <dir> [--site <name>] [--own /pet/=dist] [--redirects]
//                                                         every app's latest build under its path, plus firebase.json
//   pwa-site stale --manifest <file|url> --flavor <f>     which apps published since that deploy
//   pwa-site redirects-check                              whether every old site redirects as apps.json says
//
// Common options: --registry <file|url> (default ./apps.json, else <owner>/portal's on main),
// --owner <github owner> (default GITHUB_REPOSITORY_OWNER).
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { headersFor } from '../src/security-headers';
import {
  BUILD_STAMP,
  RETIRED_WORKER_MARK,
  SITE_MANIFEST,
  featuresOf,
  normalizePath,
  redirectConfig,
  retiredWorkerSource,
  sharedSite,
  siteApps,
  siteConfig,
  staleApps,
  unionFeatures,
  type BuildStamp,
  type HostingSite,
  type SiteManifest,
} from '../src/site';

const RELEASE_TAG = 'hosting';
const assetName = (flavor: string) => (flavor === 'staging' ? 'site-staging.tar.gz' : 'site.tar.gz');

const FLAGS = new Set(['redirects']);
const [command, ...rest] = process.argv.slice(2);
const options = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) positional.push(a);
  else if (FLAGS.has(a.slice(2))) options.set(a.slice(2), 'true');
  else options.set(a.slice(2), rest[++i] ?? '');
}
const opt = (name: string) => options.get(name);
const flag = (name: string) => options.get(name) === 'true';

const owner = opt('owner') ?? process.env.GITHUB_REPOSITORY_OWNER ?? 'huishouden';
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

function fail(message: string): never {
  console.error(`pwa-site: ${message}`);
  process.exit(1);
}

function output(key: string, value: string) {
  console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function getJson(url: string, api = false): Promise<unknown | null> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: api ? { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } : {},
      cache: 'no-store',
    }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }) as Response);
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (attempt >= 3) fail(`${url}: ${res.status} ${res.statusText}`);
    await Bun.sleep(2000 * attempt);
  }
}

async function loadRegistry(): Promise<unknown> {
  const from = opt('registry') ?? (existsSync('apps.json') ? 'apps.json' : `https://raw.githubusercontent.com/${owner}/portal/main/apps.json`);
  if (/^https:\/\//.test(from)) {
    const json = await getJson(from);
    if (!json) fail(`no registry at ${from}`);
    return json;
  }
  return JSON.parse(readFileSync(from, 'utf8'));
}

/** The latest published build of `repo` for `flavor`: its asset id, or null when it has none. */
async function latestAsset(repo: string, flavor: string): Promise<number | null> {
  for (let attempt = 1; ; attempt++) {
    const release = (await getJson(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${RELEASE_TAG}`, true)) as { assets?: { id: number; name: string }[] } | null;
    if (!release) return null;
    const id = release.assets?.find((a) => a.name === assetName(flavor))?.id;
    if (id !== undefined) return id;
    // A release without the asset is most likely mid-replacement (upload --clobber deletes first).
    if (attempt >= 4) return null;
    await Bun.sleep(5000);
  }
}

function tar(args: string[]) {
  const r = spawnSync('tar', args, { stdio: 'inherit' });
  if (r.status !== 0) fail(`tar ${args.join(' ')} failed`);
}

/** Downloads and unpacks the latest build of `repo` into `dest`; returns the asset id used, or null. */
async function fetchBuild(repo: string, flavor: string, dest: string): Promise<number | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const id = await latestAsset(repo, flavor);
    if (id === null) return null;
    // By id, so the files and the id recorded in the manifest always match, even if a newer build
    // replaces the asset meanwhile (that id then 404s and the loop picks up the new one).
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${id}`, {
      headers: { Accept: 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }).catch(() => null);
    if (!res?.ok) {
      await Bun.sleep(2000 * attempt);
      continue;
    }
    const tmp = mkdtempSync(join(tmpdir(), 'hh-site-'));
    const file = join(tmp, 'build.tar.gz');
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
    mkdirSync(dest, { recursive: true });
    tar(['-xzf', file, '-C', dest, '--no-same-owner']);
    rmSync(tmp, { recursive: true, force: true });
    const links = spawnSync('find', [dest, '-type', 'l'], { encoding: 'utf8' }).stdout.trim();
    if (links) fail(`${repo}'s build contains symlinks: ${links}`);
    return id;
  }
  fail(`could not download ${repo}'s ${assetName(flavor)}`);
}

function readStamp(dir: string): Partial<BuildStamp> {
  try {
    return JSON.parse(readFileSync(join(dir, BUILD_STAMP), 'utf8'));
  } catch {
    return {};
  }
}

async function pack() {
  const [dist, out] = positional;
  const path = opt('path');
  if (!dist || !out || !path) fail('usage: pwa-site pack <dist> <out.tar.gz> --path /pet/');
  if (!existsSync(join(dist, 'index.html'))) fail(`${dist} has no index.html; build first`);
  let permissionsPolicy: string | undefined;
  const firebaseJson = opt('firebase') ?? 'firebase.json';
  if (existsSync(firebaseJson)) {
    const hosting = JSON.parse(readFileSync(firebaseJson, 'utf8')).hosting;
    const site = Array.isArray(hosting) ? hosting[0] : hosting;
    permissionsPolicy = headersFor(site?.headers ?? [], '/').get('permissions-policy');
  }
  let version = '0.0.0';
  try {
    version = JSON.parse(readFileSync('package.json', 'utf8')).version ?? version;
  } catch {}
  const stamp: BuildStamp = {
    repo: process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '',
    path: normalizePath(path),
    sha: process.env.GITHUB_SHA ?? 'local',
    version,
    builtAt: new Date().toISOString(),
    ...(permissionsPolicy ? { permissionsPolicy } : {}),
  };
  writeFileSync(join(dist, BUILD_STAMP), `${JSON.stringify(stamp, null, 2)}\n`);
  tar(['-czf', out, '-C', dist, '.']);
  console.log(`packed ${dist} as ${out} (${stamp.path}, ${stamp.sha.slice(0, 7)})`);
}

async function assemble() {
  const flavor = opt('flavor');
  const out = opt('out');
  if ((flavor !== 'production' && flavor !== 'staging') || !out) fail('usage: pwa-site assemble --flavor production|staging --out <dir> [--site <name>] [--own /pet/=dist] [--redirects]');
  const registry = await loadRegistry();
  const apps = siteApps(registry);
  const site = opt('site') ?? (flavor === 'production' ? sharedSite(registry) : fail('staging needs --site (the app\'s staging site)'));
  const ownArg = opt('own');
  const own = ownArg ? { path: normalizePath(ownArg.split('=')[0]), dir: ownArg.split('=').slice(1).join('=') } : null;
  if (own && !apps.some((a) => a.path === own.path)) fail(`--own ${own.path} is not in apps.json`);

  rmSync(out, { recursive: true, force: true });
  const pub = join(out, 'public');
  mkdirSync(pub, { recursive: true });
  const manifest: SiteManifest = { site, flavor, deployedAt: new Date().toISOString(), apps: {} };
  const included: string[] = [];
  const policies: (string | undefined)[] = [];
  // The portal first: the apps unpack into folders inside its files.
  for (const app of apps) {
    const dest = app.path === '/' ? pub : join(pub, app.path);
    let asset: number | null = null;
    if (own?.path === app.path) {
      mkdirSync(dest, { recursive: true });
      cpSync(own.dir, dest, { recursive: true });
    } else {
      asset = await fetchBuild(app.repo, flavor, dest);
      if (asset === null) {
        console.log(`${app.path} (${app.repo}): no published build yet; left out`);
        continue;
      }
    }
    const stamp = readStamp(dest);
    policies.push(stamp.permissionsPolicy);
    manifest.apps[app.path] = { repo: app.repo, asset, ...(stamp.sha ? { sha: stamp.sha } : {}), ...(stamp.version ? { version: stamp.version } : {}) };
    included.push(app.path);
    console.log(`${app.path} (${app.repo}): ${asset === null ? 'this build' : `asset ${asset}`}${stamp.sha ? `, ${stamp.sha.slice(0, 7)}` : ''}`);
  }
  if (!included.includes('/')) fail('the portal has no published build; nothing to serve at /');
  // Each app's own folder must not hide another's: the portal's files are at the root only.
  for (const path of included.filter((p) => p !== '/')) {
    if (!existsSync(join(pub, path, 'index.html'))) fail(`${path} has no index.html`);
  }
  writeFileSync(join(pub, SITE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  const features = unionFeatures(policies.map(featuresOf));
  const hosting: HostingSite[] = [siteConfig(site, included, features)];
  if (flag('redirects') && flavor === 'production') {
    // Only to a path this deploy serves: an old site never redirects to a 404.
    for (const app of apps.filter((a) => a.redirect && a.path !== '/' && a.site !== site && included.includes(a.path))) {
      const dir = `legacy-${app.site}`;
      mkdirSync(join(out, dir), { recursive: true });
      writeFileSync(join(out, dir, 'sw.js'), retiredWorkerSource());
      hosting.push(redirectConfig(app.site, `https://${site}.web.app${app.path}`, dir));
    }
  }
  writeFileSync(join(out, 'firebase.json'), `${JSON.stringify({ hosting }, null, 2)}\n`);
  output('only', hosting.map((h) => `hosting:${h.site}`).join(','));
  output('site', site);
}

async function stale() {
  const flavor = opt('flavor') ?? 'production';
  const from = opt('manifest');
  if (!from) fail('usage: pwa-site stale --manifest <file|url> [--flavor production|staging]');
  const manifest = (/^https:\/\//.test(from) ? await getJson(`${from}${from.includes('?') ? '&' : '?'}t=${Date.now()}`) : existsSync(from) ? JSON.parse(readFileSync(from, 'utf8')) : null) as SiteManifest | null;
  const apps = siteApps(await loadRegistry());
  const latest: Record<string, number | null> = {};
  for (const app of apps) latest[app.path] = await latestAsset(app.repo, flavor);
  const paths = staleApps(manifest, latest);
  if (paths.length) console.log(`newer builds than ${from}: ${paths.join(' ')}`);
  else console.log(`${from} holds every app's latest build`);
  output('stale', paths.length ? 'true' : 'false');
}

async function redirectsCheck() {
  const registry = await loadRegistry();
  const site = sharedSite(registry);
  const wrong: string[] = [];
  for (const app of siteApps(registry).filter((a) => a.redirect && a.path !== '/' && a.site !== site)) {
    const probe = `https://${app.site}.web.app/hh-check/deep?x=1`;
    const want = `https://${site}.web.app${app.path}hh-check/deep?x=1`;
    const res = await fetch(probe, { redirect: 'manual' }).catch(() => null);
    const location = res?.headers.get('location') ?? '';
    const worker = await fetch(`https://${app.site}.web.app/sw.js`, { redirect: 'manual' })
      .then((r) => r.text())
      .catch(() => '');
    if (res?.status !== 301 || location !== want || !worker.includes(RETIRED_WORKER_MARK)) {
      wrong.push(app.site);
      console.log(`${app.site}: ${res?.status ?? 'no answer'} → ${location || '(none)'}; want 301 → ${want} and the retiring /sw.js`);
    } else console.log(`${app.site}: redirects to ${site}.web.app${app.path}`);
  }
  output('wrong', wrong.length ? 'true' : 'false');
}

const commands: Record<string, () => Promise<void>> = { pack, assemble, stale, 'redirects-check': redirectsCheck };
if (!command || !commands[command]) {
  console.error('usage: pwa-site pack|assemble|stale|redirects-check ... (see the header of scripts/site.ts)');
  process.exit(2);
}
await commands[command]();
