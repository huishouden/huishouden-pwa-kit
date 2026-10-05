#!/usr/bin/env python3
# The release a push to main calls for, from the Conventional Commit titles since the last v* tag:
# prints tag= (the new tag, empty when only chore/docs/test/ci/build/style commits landed), prev= (the
# last tag) and label= (what to call this build). Run in a clone with tags. Kept identical to the copy
# inlined in .github/workflows/pwa.yml (test/next-version.test.ts), which reusable workflows cannot import.
import re, subprocess
def git(*a):
    return subprocess.run(['git', *a], capture_output=True, text=True, check=True).stdout
tags = [t for t in git('tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*').split() if re.fullmatch(r'v\d+\.\d+\.\d+', t)]
tags.sort(key=lambda t: tuple(int(x) for x in t[1:].split('.')))
last = tags[-1] if tags else ''
raw = git('log', '--no-merges', '--format=%s%x1f%b%x1e', f'{last}..HEAD' if last else 'HEAD')
level = None
for rec in raw.split('\x1e'):
    rec = rec.strip()
    if not rec:
        continue
    subject, _, body = rec.partition('\x1f')
    m = re.match(r'^(\w+)(?:\([^)]*\))?(!)?:\s*\S', subject)
    kind = m.group(1).lower() if m else ''
    if (m and m.group(2)) or re.search(r'^BREAKING[ -]CHANGE:', body, re.M):
        level = 'major'
    elif kind == 'feat' and level != 'major':
        level = 'minor'
    elif kind in ('fix', 'perf', 'refactor') and level is None:
        level = 'patch'
nxt = ''
if level:
    major, minor, patch = (int(x) for x in (last[1:] if last else '1.0.0').split('.'))
    if not last:
        nxt = 'v1.0.0'
    else:
        if level == 'major' and major == 0:
            level = 'minor'
        nxt = 'v' + {'major': f'{major + 1}.0.0', 'minor': f'{major}.{minor + 1}.0', 'patch': f'{major}.{minor}.{patch + 1}'}[level]
print(f'tag={nxt}')
print(f'prev={last}')
print(f'label={nxt or last or "v0.0.0"}')
