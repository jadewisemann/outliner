#!/usr/bin/env bash
# Starts tauri-driver, runs the native smoke test against the given app
# binary, and stops the driver. Linux runs it under xvfb-run.
#
#   run-driver.sh <app binary> <evidence dir>
set -uo pipefail
tauri-driver --port 4444 &
driver=$!
sleep 3
node "$(dirname "$0")/smoke.mjs" "$1" "$2"
status=$?
kill "$driver" 2>/dev/null
exit $status
