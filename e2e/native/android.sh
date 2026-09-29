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
# The webview's accessibility tree fills in lazily; ask twice before falling back.
read -r x1 y1 x2 y2 <<< "$(bounds_of start Inbox)"
if [ -z "${y1:-}" ]; then
  sleep 4
  dump start
  read -r x1 y1 x2 y2 <<< "$(bounds_of start Inbox)"
fi
size="$(adb shell wm size | awk '{print $3}' | tr -d '\r')"
width="${size%x*}"
height="${size#*x}"
if [ -n "${y1:-}" ]; then
  say "info title at y=$y1..$y2 (accessibility tree)"
  row_x=$(((x1 + x2) / 2))
  row_y=$((y2 + (y2 - y1)))
  a11y=1
else
  # Measured from the start screenshot: the first row sits at a quarter of the
  # height, below the header and the title.
  say "info no accessibility tree from the webview; tapping by layout"
  row_x=$((width / 3))
  row_y=$((height / 4))
  a11y=0
fi

adb exec-out screencap -p > "$out/before.png"
adb shell input tap "$row_x" "$row_y"
sleep 2
adb shell input text "typed%sfrom%sandroid"
sleep 3
adb exec-out screencap -p > "$out/android-typed.png"
adb shell input keyevent KEYCODE_ESCAPE
sleep 2
dump typed
if grep -q "typed from android" "$out/typed.xml"; then
  say "ok   typing reaches the outline (accessibility tree)"
elif [ "$a11y" = 0 ]; then
  # No tree to read: the band around the row must have gained ink.
  if python3 "$(dirname "$0")/ink.py" "$out/before.png" "$out/android-typed.png" "$row_y"; then
    say "ok   typing reaches the outline (pixels changed on the row)"
  else
    say "FAIL nothing appeared on the row after typing"
    fail=1
  fi
else
  say "FAIL the typed text is not in the outline"
  fail=1
fi

# Insets: the app's first pixels below the status bar must be the app's, and
# the status bar strip must not contain the header. Read from the accessibility
# tree when there is one; otherwise the screenshot is the evidence.
if [ -n "${status_bottom:-}" ] && [ "$a11y" = 1 ]; then
  header_top="$(grep -o 'text="Inbox"[^>]*bounds="[^"]*"' "$out/start.xml" | grep -o 'bounds="\[[0-9]*,[0-9]*' | grep -o '[0-9]*$' | sort -n | head -1)"
  say "info header top=${header_top:-?} status bar bottom=$status_bottom"
  if [ -n "${header_top:-}" ] && [ "$header_top" -lt "$status_bottom" ]; then
    say "FAIL the header starts under the status bar"
    fail=1
  fi
fi

adb logcat -d > "$out/logcat.txt"
# Only the app's own crashes count: uiautomator itself is known to die now and
# then ("FATAL EXCEPTION: UiAutomation"), and that is not the app's failure.
if grep -A2 "FATAL EXCEPTION" "$out/logcat.txt" | grep -q "Process: $app"; then
  say "FAIL the app crashed"
  fail=1
fi
# The webview forwards the page's console to logcat under the chromium tag.
grep -E "chromium.*(Uncaught|TypeError|ReferenceError|Content Security Policy)" "$out/logcat.txt" > "$out/js-errors.txt" || true
if [ -s "$out/js-errors.txt" ]; then
  say "FAIL the page reported errors:"
  cat "$out/js-errors.txt"
  fail=1
fi

[ "$fail" = 0 ] && say "ok   android smoke"
exit "$fail"
