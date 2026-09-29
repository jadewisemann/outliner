#!/usr/bin/env bash
# Starts tauri-driver, runs the native smoke test against the given app
# binary, and stops the driver. Linux runs it under xvfb-run; Windows passes
# the Edge driver that matches its WebView2 in NATIVE_DRIVER.
#
#   run-driver.sh <app binary> <evidence dir>
set -uo pipefail
if [ -n "${NATIVE_DRIVER:-}" ]; then
  tauri-driver --port 4444 --native-driver "$NATIVE_DRIVER" &
else
  tauri-driver --port 4444 &
fi
driver=$!
sleep 3
node "$(dirname "$0")/smoke.mjs" "$1" "$2"
status=$?
kill "$driver" 2>/dev/null
exit $status
