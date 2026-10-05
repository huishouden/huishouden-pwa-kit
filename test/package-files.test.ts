import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Apps install the release tarball, which holds only `files`, not the repo: everything a consumer
// reads from node_modules/@huishouden/pwa-kit must be listed (the pre-commit hook reads
// actions/leak-scan; the bins import ../src; pwa.yml and hh read scripts/ and infra/ from it).
test('the package ships what consumers read', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as { files: string[]; version: string };
  for (const dir of ['actions', 'dist', 'infra', 'scripts', 'src', 'templates']) expect(pkg.files).toContain(dir);
  // Versions are tags CI makes; package.json stays 0.0.0 in git.
  expect(pkg.version).toBe('0.0.0');
});
