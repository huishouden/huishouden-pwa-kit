#!/usr/bin/env bash
# Usage: check.sh <expected LICENSE> [repo dir]. The expected file is the kit's LICENSE: the official
# PolyForm Shield 1.0.0 text (https://polyformproject.org/licenses/shield/1.0.0.txt) and the
# Required Notice line.
set -euo pipefail
expected=$1
dir=${2:-.}
spdx=PolyForm-Shield-1.0.0
notice='Required Notice: Copyright (c) 2026 Caleb Piekstra (https://github.com/huishouden)'
fail=0

grep -qxF '# PolyForm Shield License 1.0.0' "$expected" && grep -qxF "$notice" "$expected" || {
  echo "::error::$expected is not PolyForm Shield 1.0.0 with the Required Notice"; exit 1; }

if [ ! -f "$dir/LICENSE" ]; then
  echo "::error file=LICENSE::No LICENSE. Copy the kit's LICENSE (PolyForm Shield 1.0.0 with the Required Notice)."
  fail=1
elif ! cmp -s "$expected" "$dir/LICENSE"; then
  echo "::error file=LICENSE::LICENSE is not the kit's PolyForm Shield 1.0.0 text with the Required Notice:"
  diff "$expected" "$dir/LICENSE" | head -20 || true
  fail=1
fi

if [ -f "$dir/package.json" ]; then
  license=$(jq -r '.license // ""' "$dir/package.json")
  if [ "$license" != "$spdx" ]; then
    echo "::error file=package.json::package.json license is \"$license\", not \"$spdx\""
    fail=1
  fi
fi

[ "$fail" = 0 ] && echo "LICENSE is PolyForm Shield 1.0.0 with the Required Notice; package.json says $spdx."
exit "$fail"
