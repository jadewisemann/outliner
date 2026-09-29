#!/usr/bin/env bash
# The smoke test for a platform with no WebDriver for its webview (macOS:
# WKWebView has none). Launches the real app and waits for proof that the web
# code ran inside it and reached the shell over IPC: on first load the app
# saves, and in the shell every save also writes the replica file in the app's
# data folder. That one file answers three questions at once — the page
# loaded, its CSP let the IPC channel through, and the Rust side wrote to disk.
#
#   launch.sh <app binary> <app data dir> <evidence dir>
set -uo pipefail
app="$1"
data="$2"
out="$3"
mkdir -p "$out"
say() { echo "$1"; echo "$1" >> "$out/result.txt"; }
rm -rf "$data"

"$app" > "$out/app.log" 2>&1 &
pid=$!
found=0
for _ in $(seq 1 60); do
  if [ -f "$data/workspace.json" ] && grep -q '"savedAt"' "$data/workspace.json" && grep -q 'Inbox' "$data/workspace.json"; then
    found=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 1
done
sleep 2
if command -v screencapture >/dev/null; then screencapture -x "$out/launch.png" || true; fi

fail=0
if kill -0 "$pid" 2>/dev/null; then
  say "ok   the app is running"
else
  say "FAIL the app exited"
  fail=1
fi
if [ "$found" = 1 ]; then
  say "ok   the page loaded and saved through IPC ($data/workspace.json)"
  cp "$data/workspace.json" "$out/replica.json"
else
  say "FAIL no replica file: the page did not load, or IPC did not reach the shell"
  fail=1
fi
kill "$pid" 2>/dev/null
exit "$fail"
