#!/usr/bin/env bash
# Android smoke test, run inside a booted emulator (CI: android-emulator-runner).
#
# Installs the APK, launches it, and checks through the accessibility tree
# (uiautomator), which exposes the webview's text:
#  - the app is running and did not crash;
#  - the header is not under the status bar (window insets are applied);
#  - tapping the first row and typing puts the text in the outline.
# Screenshots, the accessibility dumps and the app's log are kept as evidence.
#
#   android.sh <apk> <evidence dir>
set -uo pipefail
apk="$1"
out="$2"
app="io.github.jadewisemann.outliner"
mkdir -p "$out"
fail=0
say() { echo "$1"; echo "$1" >> "$out/result.txt"; }

dump() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml > "$out/$1.xml"
}

# Bounds "[x1,y1][x2,y2]" of the lowest node whose text is exactly $2 in dump $1.
bounds_of() {
  grep -o "text=\"$2\"[^>]*bounds=\"[^\"]*\"" "$out/$1.xml" | grep -o 'bounds="[^"]*"' | sed 's/bounds="//;s/"//' | \
    awk -F'[][,]' '{print $2, $3, $5, $6}' | sort -k4 -n | tail -1
}

adb install -r "$apk" || { say "FAIL install"; exit 1; }
adb logcat -c
adb shell monkey -p "$app" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 15
adb exec-out screencap -p > "$out/android-start.png"
dump start

if ! adb shell pidof "$app" >/dev/null; then
  say "FAIL the app is not running after launch"
  fail=1
fi

# The status bar's own clock sits at the very top; the app's content must start
# below it. The document title is the lowest "Inbox" on screen.
status_bottom="$(adb shell dumpsys window | grep -o 'statusBars.*frame=\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' | head -1 | grep -o '\]\[[0-9]*,[0-9]*\]' | grep -o ',[0-9]*' | tr -d ',')"
if [ -z "${status_bottom:-}" ]; then
  # 24dp is the status bar height on every emulator image this runs on.
  density="$(adb shell wm density | grep -o '[0-9]*' | tail -1)"
  status_bottom=$((24 * ${density:-160} / 160))
fi
read -r x1 y1 x2 y2 <<< "$(bounds_of start Inbox)"
if [ -z "${y1:-}" ]; then
  say "FAIL no Inbox title in the accessibility tree"
  fail=1
else
  say "info title at y=$y1..$y2, status bar bottom=${status_bottom:-?}"
  # Tap just under the title: the first row.
  row_y=$((y2 + (y2 - y1)))
  adb shell input tap $(((x1 + x2) / 2)) "$row_y"
  sleep 2
  adb shell input text "typed%sfrom%sandroid"
  sleep 3
  adb exec-out screencap -p > "$out/android-typed.png"
  # Leave the row so it renders, then read the tree.
  adb shell input keyevent KEYCODE_ESCAPE
  sleep 2
  dump typed
  if grep -q "typed from android" "$out/typed.xml"; then
    say "ok   typing reaches the outline"
  else
    say "FAIL the typed text is not in the outline"
    fail=1
  fi
fi

# Insets: the header's breadcrumb (the highest "Inbox" on screen) must start
# below the status bar, not under it.
if [ -n "${status_bottom:-}" ]; then
  header_top="$(grep -o 'text="Inbox"[^>]*bounds="[^"]*"' "$out/start.xml" | grep -o 'bounds="\[[0-9]*,[0-9]*' | grep -o '[0-9]*$' | sort -n | head -1)"
  say "info header top=${header_top:-?}"
  if [ -z "${header_top:-}" ] || [ "$header_top" -lt "$status_bottom" ]; then
    say "FAIL the header starts under the status bar"
    fail=1
  else
    say "ok   content starts below the status bar"
  fi
fi

adb logcat -d > "$out/logcat.txt"
if grep -E "FATAL EXCEPTION" "$out/logcat.txt" >/dev/null; then
  say "FAIL the app crashed"
  fail=1
fi
grep -E "Uncaught|TypeError|ReferenceError|Content Security Policy" "$out/logcat.txt" > "$out/js-errors.txt" || true
if [ -s "$out/js-errors.txt" ]; then
  say "FAIL the page reported errors:"
  cat "$out/js-errors.txt"
  fail=1
fi

[ "$fail" = 0 ] && say "ok   android smoke"
exit "$fail"
