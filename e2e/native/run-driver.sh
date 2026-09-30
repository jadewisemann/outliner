#!/usr/bin/env bash
# Starts tauri-driver, runs the native smoke test against the given app
# binary, and stops the driver. Linux runs it under xvfb-run.
#
#   run-driver.sh <app binary> <evidence dir>
set -uo pipefail
tauri-driver --port 4444 &
driver=$!
# Wait until the driver answers (it starts the native WebKitWebDriver behind
# it), for at most about 10 s. If it never does, smoke.mjs fails on its first
# call and says so.
for _ in $(seq 1 40); do
  curl -sf -m 1 -o /dev/null http://127.0.0.1:4444/status && break
  sleep 0.25
done
node "$(dirname "$0")/smoke.mjs" "$1" "$2"
status=$?
kill "$driver" 2>/dev/null
exit $status
