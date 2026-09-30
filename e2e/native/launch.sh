#!/usr/bin/env bash
# The smoke test for a platform where the webview cannot be driven over
# WebDriver. macOS: WKWebView has no driver. Windows: msedgedriver has to match
# the runner's WebView2 build exactly, and even when it does it did not attach
# to the Tauri webview (`DevToolsActivePort file doesn't exist`, see
# docs/design/native.md 「검증」). Launches the real app and waits for proof
# that the web code ran inside it and reached the shell over IPC: on first load
# the app saves, and in the shell every save also writes the replica file in
# the app's data folder. That one file answers three questions at once — the
# page loaded, its CSP let the IPC channel through, and the Rust side wrote to
# disk.
#
#   launch.sh <app binary> <app data dir> <evidence dir>
set -uo pipefail
app="$1"
data="$2"
out="$3"
# Git Bash on Windows hands us `C:\Users\...`; test and copy with a POSIX path.
if command -v cygpath >/dev/null; then data="$(cygpath -u "$data")"; fi
mkdir -p "$out"
say() { echo "$1"; echo "$1" >> "$out/result.txt"; }
rm -rf "$data"

screenshot() {
  if command -v screencapture >/dev/null; then
    screencapture -x "$out/launch.png" || true
  elif command -v powershell.exe >/dev/null; then
    local target
    target="$(cygpath -w "$out")\\launch.png"
    powershell.exe -NoProfile -Command "
      Add-Type -AssemblyName System.Windows.Forms, System.Drawing
      \$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      \$i = New-Object System.Drawing.Bitmap \$b.Width, \$b.Height
      [System.Drawing.Graphics]::FromImage(\$i).CopyFromScreen(\$b.Location, [System.Drawing.Point]::Empty, \$b.Size)
      \$i.Save('$target')" || true
  fi
}

"$app" > "$out/app.log" 2>&1 &
pid=$!
found=0
for _ in $(seq 1 90); do
  if [ -f "$data/workspace.json" ] && grep -q '"savedAt"' "$data/workspace.json" && grep -q 'Inbox' "$data/workspace.json"; then
    found=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 1
done
sleep 2
screenshot

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
  ls -la "$data" >> "$out/result.txt" 2>&1 || true
  fail=1
fi
kill "$pid" 2>/dev/null
# Git Bash's kill does not always reach a native Windows GUI process.
if command -v taskkill >/dev/null; then taskkill //F //IM "$(basename "$app")" >/dev/null 2>&1 || true; fi
exit "$fail"
