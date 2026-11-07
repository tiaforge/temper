#!/usr/bin/env bash
# Screenshot the kitchen sink for the default look and each theme example, in light and dark, with headless Chrome (flatpak).
# Usage: scripts/shoot.sh [out-dir] [width] [height]
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$root/shots}; w=${2:-1440}; h=${3:-3000}
mkdir -p "$out"
(cd "$root" && exec python3 -m http.server "${PORT:-8765}" --bind 127.0.0.1 >/dev/null 2>&1) & srv=$!
# A throwaway profile, shared into the Flatpak sandbox (its /tmp is private) and removed afterwards. Without
# --user-data-dir, headless Chrome leaves a 100+ MB scoped_dir profile in ~/.var/app/com.google.Chrome per run.
profile=$(mktemp -d /tmp/temper-shot-XXXXXX)
trap "kill $srv; rm -rf '$profile'" EXIT; sleep 1
for d in default ink fjord; do
  for t in light dark; do
    timeout 60 flatpak run --filesystem="$root" --filesystem="$out" --filesystem="$profile" com.google.Chrome \
      --headless=new --disable-gpu --hide-scrollbars --window-size="$w,$h" --user-data-dir="$profile" \
      --disable-background-networking --disable-component-update --disable-sync --disable-extensions --disable-breakpad \
      --screenshot="$out/$d-$t.png" "http://127.0.0.1:${PORT:-8765}/kitchen-sink/index.html?example=${d/default/}&t=$t" >/dev/null 2>&1
    echo "$out/$d-$t.png"
  done
done
