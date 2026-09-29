#!/usr/bin/env bash
# Android smoke test, run inside a booted emulator (CI: android-emulator-runner).
# Installs the APK, launches it, types a row through the soft keyboard path,
# and keeps screenshots plus the app's log as evidence. Fails when the app
# crashes, or when the webview reports a JavaScript error.
#
#   android.sh <apk> <evidence dir>
set -uo pipefail
apk="$1"
out="$2"
app="io.github.jadewisemann.outliner"
mkdir -p "$out"
fail=0

adb install -r "$apk" || { echo "FAIL install"; exit 1; }
adb logcat -c
adb shell monkey -p "$app" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 12
adb exec-out screencap -p > "$out/android-start.png"

if ! adb shell pidof "$app" >/dev/null; then
  echo "FAIL the app is not running after launch"
  fail=1
fi

# Tap the first row (upper part of the screen) and type. `input text` needs
# ASCII; Korean input is covered by the browser e2e's IME test.
size="$(adb shell wm size | awk '{print $3}')"
width="${size%x*}"
height="${size#*x}"
adb shell input tap $((width / 2)) $((height / 6))
sleep 2
adb shell input text "typed%sfrom%sandroid"
sleep 3
adb exec-out screencap -p > "$out/android-typed.png"

adb logcat -d > "$out/logcat.txt"
if grep -E "FATAL EXCEPTION|AndroidRuntime: .*$app" "$out/logcat.txt" >/dev/null; then
  echo "FAIL the app crashed"
  fail=1
fi
# The webview forwards console errors to logcat under chromium/Console tags.
grep -E "Uncaught|TypeError|ReferenceError|Content Security Policy" "$out/logcat.txt" > "$out/js-errors.txt" || true
if [ -s "$out/js-errors.txt" ]; then
  echo "FAIL the page reported errors:"
  cat "$out/js-errors.txt"
  fail=1
fi

[ "$fail" = 0 ] && echo "ok  android smoke"
exit "$fail"
