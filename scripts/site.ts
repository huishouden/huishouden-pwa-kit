#!/usr/bin/env bun
// pwa-site: the suite's one site (docs/one-site.md). Runs in the reusable workflow; needs only bun,
// tar and network access to GitHub (GH_TOKEN, when set, only raises the API rate limit: every
// repo is public).
//
//   pwa-site pack <dist> <out.tar.gz> --path /pet/        stamp a build and pack it for a release asset
//   pwa-site assemble --flavor production|staging --out <dir> [--site <name>] [--own /pet/=dist] [--redirects]
//                                                         every app's latest build under its path, plus firebase.json
//   pwa-site stale --manifest <file|url> --flavor <f>     which apps (or the observability settings) published since that deploy
//   pwa-site redirects-check                              whether every old site redirects as apps.json says
//   pwa-site site                                         the suite's Hosting site (SUITE_SITE), as site=<name>
//   pwa-site asset-origin --flavor <f>                    the flavor's asset CDN (src/asset-cdn.ts), as origin=<url>
//   pwa-site cdn --flavor <f> --site-dir <dir> --out <dir> the CDN's upload: the assembled site's assets/, earlier
//                                                         files still within retention, _headers, hh-assets.json, wrangler.toml
//   pwa-site cdn-check --flavor <f> --site-dir <dir>      whether the live CDN holds every asset of that site (ok=true|false)
//
// assemble and stale take --assets-origin <url|none> (default none): with a URL the pages keep naming
// the CDN and the site manifest records it; with none every CDN address is removed from the pages
// and service workers, which then load the site's own copy (docs/one-site.md "Asset CDN").
// --cdn-held (with a URL; a deploy without the Cloudflare token, which can't upload): only apps
// whose every asset the live CDN already holds keep naming it, the rest load the site's own copy
// and the site manifest lists them as offCdn; stale --cdn-held then leaves them be, while a stale
// without it (a run that can upload) counts them as stale.
//
// Common options: --registry <file|url> (default ./apps.json, else <owner>/portal's on main),
// --owner <github owner> (default GITHUB_REPOSITORY_OWNER).
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import {
  ASSET_MANIFEST,
  ASSET_ORIGINS,
  ASSET_RETENTION_DAYS,
  appsOffCdn,
  offCdnPredicate,
  cdnHeaders,
  cdnWranglerConfig,
  isCdnAsset,
  namesCdn,
  parseAssetManifest,
  planAssetOrigin,
  retainAssets,
  type Flavor,
} from '../src/asset-cdn';
import { headersFor } from '../src/security-headers';
import {
  BUILD_STAMP,
  RETIRED_WORKER_MARK,
  SITE_MANIFEST,
  featuresOf,
  normalizePath,
  redirectConfig,
  redirectingSites,
  retiredWorkerSource,
  retiringWorkers,
  sharedSite,
  siteApps,
  siteConfig,
  staleApps,
  staleCdn,
  type BuildStamp,
  type HostingSite,
  type SiteManifest,
  staleObservability,
} from '../src/site';
import { SITE_OBSERVABILITY, parseSiteObservability } from '../src/observability';

const RELEASE_TAG = 'hosting';
const assetName = (flavor: string) => (flavor === 'staging' ? 'site-staging.tar.gz' : 'site.tar.gz');

const FLAGS = new Set(['redirects', 'cdn-held']);
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
async function latestAsset(repo: string, flavor: string, tag = RELEASE_TAG, name = assetName(flavor)): Promise<number | null> {
  for (let attempt = 1; ; attempt++) {
    const release = (await getJson(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, true)) as { assets?: { id: number; name: string }[] } | null;
    if (!release) return null;
    const id = release.assets?.find((a) => a.name === name)?.id;
    if (id !== undefined) return id;
    // A release without the asset is most likely mid-replacement (upload --clobber deletes first).
    if (attempt >= 4) return null;
    await Bun.sleep(5000);
  }
}

// The browser-agent settings for every app, published by the portal's monitoring workflow
// (docs/observability.md) as an asset of its `observability` release.
const OBSERVABILITY_TAG = 'observability';
const OBSERVABILITY_ASSET = 'observability.json';
const portalRepo = (registry: unknown) => siteApps(registry)[0].repo;

/** Writes `<pub>/hh-observability.json` for the apps in this deploy; returns the asset id used, or null. */
async function writeObservability(repo: string, pub: string, paths: string[]): Promise<number | null> {
  const id = await latestAsset(repo, 'production', OBSERVABILITY_TAG, OBSERVABILITY_ASSET);
  if (id === null) {
    console.log(`${SITE_OBSERVABILITY}: ${repo} has published no ${OBSERVABILITY_ASSET}; apps fall back to their build variables`);
    return null;
  }
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${id}`, {
    headers: { Accept: 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }).catch(() => null);
  const parsed = res?.ok ? parseSiteObservability(await res.json().catch(() => null)) : null;
  // A file that isn't exactly account and app ids and browser keys is never published.
  if (!parsed) fail(`${repo}'s ${OBSERVABILITY_ASSET} (asset ${id}) is missing or not valid; not publishing it`);
  const apps = Object.fromEntries(Object.entries(parsed.apps).filter(([path]) => paths.includes(path)));
  writeFileSync(join(pub, SITE_OBSERVABILITY), `${JSON.stringify({ accountId: parsed.accountId, apps }, null, 2)}\n`);
  console.log(`${SITE_OBSERVABILITY}: asset ${id}, ${Object.keys(apps).length} of ${paths.length} apps configured`);
  return id;
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

/** The `Permissions-Policy` the repo's own firebase.json sends on its pages. */
function ownPermissionsPolicy(): string | undefined {
  const firebaseJson = opt('firebase') ?? 'firebase.json';
  if (!existsSync(firebaseJson)) return undefined;
  const hosting = JSON.parse(readFileSync(firebaseJson, 'utf8')).hosting;
  const site = Array.isArray(hosting) ? hosting[0] : hosting;
  return headersFor(site?.headers ?? [], '/').get('permissions-policy');
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
  const permissionsPolicy = ownPermissionsPolicy();
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
  if ((flavor !== 'production' && flavor !== 'staging') || !out) fail('usage: pwa-site assemble --flavor production|staging --out <dir> [--site <name>] [--own /pet/=dist] [--redirects] [--assets-origin <url|none>] [--cdn-held]');
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
    // This run's own build has no stamp (it isn't packed): its policy is in the repo's firebase.json.
    policies.push(asset === null ? (stamp.permissionsPolicy ?? ownPermissionsPolicy()) : stamp.permissionsPolicy);
    manifest.apps[app.path] = { repo: app.repo, asset, ...(stamp.sha ? { sha: stamp.sha } : {}), ...(stamp.version ? { version: stamp.version } : {}) };
    included.push(app.path);
    console.log(`${app.path} (${app.repo}): ${asset === null ? 'this build' : `asset ${asset}`}${stamp.sha ? `, ${stamp.sha.slice(0, 7)}` : ''}`);
  }
  if (!included.includes('/')) fail('the portal has no published build; nothing to serve at /');
  // Each app's own folder must not hide another's: the portal's files are at the root only.
  for (const path of included.filter((p) => p !== '/')) {
    if (!existsSync(join(pub, path, 'index.html'))) fail(`${path} has no index.html`);
  }
  if (flavor === 'production') manifest.observability = await writeObservability(portalRepo(registry), pub, included);
  const origin = assetOriginOpt(flavor);
  const offCdn = origin && flag('cdn-held') ? appsOffCdn(walk(pub).filter(isCdnAsset), included, await liveAssets(origin)) : [];
  manifest.assetOrigin = applyAssetOrigin(pub, origin, offCdn, offCdnPredicate(offCdn, included));
  if (offCdn.length) manifest.offCdn = offCdn;
  writeFileSync(join(pub, SITE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  const hosting: HostingSite[] = [siteConfig(site, included.map((path, i) => ({ path, features: featuresOf(policies[i]) })))];
  if (flag('redirects') && flavor === 'production') {
    // Only to a path this deploy serves: an old site never redirects to a 404.
    for (const app of redirectingSites(registry).filter((a) => a.site !== site && included.includes(a.path))) {
      const dir = `legacy-${app.site}`;
      const workers = retiringWorkers(app, apps);
      for (const w of workers) {
        mkdirSync(join(out, dir, w, '..'), { recursive: true });
        writeFileSync(join(out, dir, w), retiredWorkerSource());
      }
      hosting.push(redirectConfig(app.site, `https://${site}.web.app${app.path}`, dir, workers));
    }
  }
  writeFileSync(join(out, 'firebase.json'), `${JSON.stringify({ hosting }, null, 2)}\n`);
  output('only', hosting.map((h) => `hosting:${h.site}`).join(','));
  output('site', site);
}

/** Every file under `dir`, as a path from its root (`/pet/assets/x.js`). */
function walk(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) visit(full);
      else if (e.isFile()) out.push(`/${relative(dir, full).split(sep).join('/')}`);
    }
  };
  visit(dir);
  return out.sort();
}

/** `--assets-origin`: the flavor's CDN origin, or null for none (the default). Any other URL is refused. */
function assetOriginOpt(flavor: string): string | null {
  const raw = opt('assets-origin') ?? 'none';
  if (raw === 'none' || raw === '') return null;
  const want = ASSET_ORIGINS[flavor as Flavor];
  if (raw !== want) fail(`--assets-origin for ${flavor} must be ${want} or none, got ${raw}`);
  return raw;
}

/** Applies `planAssetOrigin` (src/asset-cdn.ts) to the assembled site; returns what the manifest records. */
function applyAssetOrigin(pub: string, origin: string | null, offCdn: string[] = [], isOffCdn: (path: string) => boolean = () => false): string | null {
  const files = walk(pub).filter(namesCdn).map((path) => ({ path, text: readFileSync(join(pub, path), 'utf8') }));
  const plan = planAssetOrigin(files, origin, isOffCdn);
  if (plan.error) fail(plan.error);
  for (const w of plan.writes) writeFileSync(join(pub, w.path), w.text);
  console.log(origin ? `asset CDN ${origin}: ${plan.naming} pages and workers name it; ${plan.writes.length} rewritten (fallback pages, and apps off it)` : `asset CDN off: ${plan.writes.length} pages and workers load the site's own assets`);
  if (offCdn.length) {
    console.log(`not on the CDN yet, served from the site until a deploy with the Cloudflare token (the portal's): ${offCdn.join(' ')}`);
    output('off-cdn', offCdn.join(' '));
  }
  return origin;
}

/** The live CDN's manifest (null before its first deploy). */
async function liveAssets(origin: string) {
  const res = await fetchRetry(`${origin}/${ASSET_MANIFEST}?t=${Date.now()}`);
  const live = res ? parseAssetManifest(await res.json().catch(() => null)) : null;
  if (res && !live) fail(`${origin}/${ASSET_MANIFEST} is not an asset manifest`);
  return live;
}

async function assetOrigin() {
  const flavor = opt('flavor') ?? 'production';
  const origin = ASSET_ORIGINS[flavor as Flavor] ?? fail('usage: pwa-site asset-origin --flavor production|staging');
  output('origin', origin);
}

async function fetchRetry(url: string): Promise<Response | null> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (res && (res.ok || res.status === 404)) return res.ok ? res : null;
    if (attempt >= 3) fail(`${url}: ${res ? `${res.status} ${res.statusText}` : 'no answer'}`);
    await Bun.sleep(2000 * attempt);
  }
}

/**
 * The CDN's next version: every asset of the assembled site, plus earlier files still within the
 * retention period, downloaded back from the CDN (Cloudflare's transfer is free), so pages and
 * service workers of earlier deploys keep finding theirs. Deploy it with `wrangler deploy -c <out>/wrangler.toml`.
 */
async function cdn() {
  const flavor = opt('flavor') as Flavor;
  const siteDir = opt('site-dir');
  const out = opt('out');
  if ((flavor !== 'production' && flavor !== 'staging') || !siteDir || !out) fail('usage: pwa-site cdn --flavor production|staging --site-dir <assembled public dir> --out <dir>');
  const origin = ASSET_ORIGINS[flavor];
  const live = walk(siteDir).filter(isCdnAsset);
  if (!live.length) fail(`${siteDir} has no assets/ files`);
  rmSync(out, { recursive: true, force: true });
  const pub = join(out, 'public');
  for (const path of live) {
    mkdirSync(dirname(join(pub, path)), { recursive: true });
    cpSync(join(siteDir, path), join(pub, path));
  }
  const res = await fetchRetry(`${origin}/${ASSET_MANIFEST}?t=${Date.now()}`);
  const previous = res ? parseAssetManifest(await res.json().catch(() => null)) : null;
  if (res && !previous) fail(`${origin}/${ASSET_MANIFEST} is not an asset manifest; not replacing the CDN's files blind`);
  if (!previous) console.log(`${origin}: no ${ASSET_MANIFEST} yet (first deploy)`);
  const { manifest, carried } = retainAssets(previous, live, flavor, new Date());
  let kept = 0;
  const missing: string[] = [];
  const queue = [...carried];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let path = queue.shift(); path; path = queue.shift()) {
        const r = await fetchRetry(`${origin}${path}`);
        if (!r) {
          missing.push(path);
          delete manifest.files[path];
          continue;
        }
        mkdirSync(dirname(join(pub, path)), { recursive: true });
        writeFileSync(join(pub, path), new Uint8Array(await r.arrayBuffer()));
        kept++;
      }
    }),
  );
  if (missing.length) console.log(`${missing.length} earlier files were already gone from the CDN: ${missing.slice(0, 5).join(' ')}${missing.length > 5 ? ' ...' : ''}`);
  writeFileSync(join(pub, '_headers'), cdnHeaders(flavor));
  writeFileSync(join(pub, ASSET_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(out, 'wrangler.toml'), cdnWranglerConfig(flavor));
  console.log(`${origin}: ${live.length} live files, ${kept} earlier ones kept (seen within ${ASSET_RETENTION_DAYS} days)`);
  output('files', String(live.length + kept));
  output('origin', origin);
}

/**
 * Whether the live CDN holds every asset of the assembled site: another repo's upload that read
 * an older manifest can replace this one's moments later. The deploy uploads again when not.
 */
async function cdnCheck() {
  const flavor = opt('flavor') as Flavor;
  const siteDir = opt('site-dir');
  if ((flavor !== 'production' && flavor !== 'staging') || !siteDir) fail('usage: pwa-site cdn-check --flavor production|staging --site-dir <assembled public dir>');
  const origin = ASSET_ORIGINS[flavor];
  const live = await liveAssets(origin);
  const missing = walk(siteDir).filter(isCdnAsset).filter((p) => !live?.files[p]);
  if (missing.length) console.log(`${origin}: ${missing.length} of this site's assets are not on the CDN: ${missing.slice(0, 5).join(' ')}${missing.length > 5 ? ' ...' : ''}`);
  else console.log(`${origin}: holds every asset of ${siteDir}`);
  output('ok', missing.length ? 'false' : 'true');
}

async function stale() {
  const flavor = opt('flavor') ?? 'production';
  const from = opt('manifest');
  if (!from) fail('usage: pwa-site stale --manifest <file|url> [--flavor production|staging]');
  const manifest = (/^https:\/\//.test(from) ? await getJson(`${from}${from.includes('?') ? '&' : '?'}t=${Date.now()}`) : existsSync(from) ? JSON.parse(readFileSync(from, 'utf8')) : null) as SiteManifest | null;
  const registry = await loadRegistry();
  const apps = siteApps(registry);
  const latest: Record<string, number | null> = {};
  for (const app of apps) latest[app.path] = await latestAsset(app.repo, flavor);
  const paths = staleApps(manifest, latest);
  const wantOrigin = assetOriginOpt(flavor);
  const cdnWhy = staleCdn(manifest, wantOrigin, !flag('cdn-held'));
  if (cdnWhy) paths.push(cdnWhy);
  if (flavor === 'production' && staleObservability(manifest, await latestAsset(portalRepo(registry), flavor, OBSERVABILITY_TAG, OBSERVABILITY_ASSET)))
    paths.push(`/${SITE_OBSERVABILITY}`);
  if (paths.length) console.log(`newer builds than ${from}: ${paths.join(' ')}`);
  else console.log(`${from} holds every app's latest build`);
  output('stale', paths.length ? 'true' : 'false');
}

async function redirectsCheck() {
  const registry = await loadRegistry();
  const site = sharedSite(registry);
  const wrong: string[] = [];
  const apps = siteApps(registry);
  for (const app of redirectingSites(registry)) {
    const probe = `https://${app.site}.web.app/hh-check/deep?x=1`;
    const want = `https://${site}.web.app${app.path}hh-check/deep?x=1`;
    const res = await fetch(probe, { redirect: 'manual' }).catch(() => null);
    const location = res?.headers.get('location') ?? '';
    const workers = await Promise.all(
      retiringWorkers(app, apps).map((w) =>
        fetch(`https://${app.site}.web.app/${w}`, { redirect: 'manual' })
          .then((r) => r.text())
          .catch(() => ''),
      ),
    );
    if (res?.status !== 301 || location !== want || !workers.every((w) => w.includes(RETIRED_WORKER_MARK))) {
      wrong.push(app.site);
      console.log(`${app.site}: ${res?.status ?? 'no answer'} → ${location || '(none)'}; want 301 → ${want} and the retiring /sw.js`);
    } else console.log(`${app.site}: redirects to ${site}.web.app${app.path}`);
  }
  output('wrong', wrong.length ? 'true' : 'false');
}

async function suiteSite() {
  output('site', sharedSite(await loadRegistry()));
}

const commands: Record<string, () => Promise<void>> = { pack, assemble, stale, 'redirects-check': redirectsCheck, site: suiteSite, 'asset-origin': assetOrigin, cdn, 'cdn-check': cdnCheck };
if (!command || !commands[command]) {
  console.error('usage: pwa-site pack|assemble|stale|redirects-check|site|asset-origin|cdn|cdn-check ... (see the header of scripts/site.ts)');
  process.exit(2);
}
await commands[command]();
