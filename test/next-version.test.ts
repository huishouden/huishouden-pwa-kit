import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The version CI computes. pwa.yml inlines scripts/next-version.py (a reusable workflow cannot
// import it), so the two must be identical, and the script is tested here.
const SCRIPT = join(import.meta.dir, '..', 'scripts', 'next-version.py');
const body = (text: string) => text.slice(text.indexOf('import re, subprocess'));

test('pwa.yml inlines scripts/next-version.py unchanged', () => {
  const wf = Bun.YAML.parse(readFileSync(join(import.meta.dir, '..', '.github', 'workflows', 'pwa.yml'), 'utf8')) as { jobs: { build: { steps: { id?: string; run?: string }[] } } };
  const run = wf.jobs.build.steps.find((s) => s.id === 'next')!.run!;
  const inline = /# next-version:begin\n([\s\S]*?)# next-version:end/.exec(run)![1];
  expect(body(inline).trim()).toBe(body(readFileSync(SCRIPT, 'utf8')).trim().replace(/\n# next-version:end$/, ''));
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'next-version-'));
  const git = (...a: string[]) => {
    const p = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: dir });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    return p.stdout.toString().trim();
  };
  git('init', '-q', '-b', 'main');
  const commit = (subject: string, body = '') => git('commit', '-q', '--allow-empty', '-m', body ? `${subject}\n\n${body}` : subject);
  const next = () => Object.fromEntries(Bun.spawnSync(['python3', SCRIPT], { cwd: dir }).stdout.toString().trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
  return { git, commit, next };
}

test('feat is minor, fix patch, breaking major; chore, docs, test, ci alone release nothing', () => {
  const r = repo();
  r.commit('chore: scaffold');
  expect(r.next()).toEqual({ tag: '', prev: '', label: 'v0.0.0' });
  r.commit('feat: first');
  expect(r.next().tag).toBe('v1.0.0');
  r.git('tag', '-a', 'v1.4.0', '-m', 'v1.4.0');
  r.git('tag', '-a', 'v1.10.0', '-m', 'v1.10.0');
  for (const s of ['docs: x', 'ci: y', 'test: z', 'chore: kit v0.99.0', 'build: b', 'style: s', 'wip stuff']) r.commit(s);
  expect(r.next()).toEqual({ tag: '', prev: 'v1.10.0', label: 'v1.10.0' });
  r.commit('fix(dev): z');
  expect(r.next().tag).toBe('v1.10.1');
  r.commit('perf: p');
  expect(r.next().tag).toBe('v1.10.1');
  r.commit('feat(x): w (#12)');
  expect(r.next()).toEqual({ tag: 'v1.11.0', prev: 'v1.10.0', label: 'v1.11.0' });
  r.commit('refactor!: v');
  expect(r.next().tag).toBe('v2.0.0');
});

test('BREAKING CHANGE in the body is major; before 1.0 a breaking change is minor', () => {
  const a = repo();
  a.commit('feat: a');
  a.git('tag', '-a', 'v2.0.0', '-m', 'v2.0.0');
  a.commit('fix: b', 'BREAKING CHANGE: gone');
  expect(a.next().tag).toBe('v3.0.0');
  const b = repo();
  b.commit('feat: a');
  b.git('tag', '-a', 'v0.9.3', '-m', 'v0.9.3');
  b.commit('feat!: b');
  expect(b.next().tag).toBe('v0.10.0');
});

test('a re-run on a tagged commit releases nothing and labels the build with that tag', () => {
  const r = repo();
  r.commit('feat: a');
  r.git('tag', '-a', 'v0.3.0', '-m', 'v0.3.0');
  expect(r.next()).toEqual({ tag: '', prev: 'v0.3.0', label: 'v0.3.0' });
});
