#!/bin/bash
set -euo pipefail

# Debug build + live reload on the iOS Simulator.
#
# A debug build loads its JS from Metro, and the packager port (8081) is baked
# into the binary via RCT_METRO_PORT, so Intervals must own 8081. This frees it
# (killing whatever squats it) and runs Intervals' Metro there. Metro stays in
# the foreground — this terminal becomes the bundler console (press r to reload).
#
# Usage:
#   yarn ios:sim                       # free 8081, debug build, live reload on booted sim
#   yarn ios:sim --clean               # clear native derived data first
#   yarn ios:sim "iPhone 17 Pro"       # target a specific simulator by name
#   INTERVALS_NO_KILL=1 yarn ios:sim   # error out instead of killing port squatters

cd "$(dirname "$0")/.."

PORT="${INTERVALS_METRO_PORT:-8081}"
DEFAULT_DEVICE="iPhone 17 Pro"
UDID_RE='[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'

DEVICE_NAME=""
EXTRA=()

for arg in "$@"; do
  case "$arg" in
    --clean)  EXTRA+=(--no-build-cache) ;;
    --*)      echo "Unknown flag: $arg" >&2; exit 1 ;;
    *)        DEVICE_NAME="$arg" ;;
  esac
done

free_port() {
  local port="$1" pids pid cwd
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "$pids" ] && { echo "▶ Port $port is free"; return 0; }

  if [ -n "${INTERVALS_NO_KILL:-}" ]; then
    echo "✗ Port $port is in use (pids: $pids) and INTERVALS_NO_KILL is set." >&2
    exit 1
  fi

  for pid in $pids; do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
    echo "▶ Freeing port $port — killing pid $pid (${cwd:-unknown dir})"
    kill "$pid" 2>/dev/null || true
  done

  for _ in 1 2 3 4 5 6; do
    lsof -ti tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1 || { echo "✓ Port $port freed"; return 0; }
    sleep 0.5
  done
  echo "✗ Port $port still busy after kill — free it manually and retry." >&2
  exit 1
}

resolve_udid_by_name() {
  xcrun simctl list devices available \
    | grep -F " $1 (" \
    | grep -oE "$UDID_RE" \
    | head -1
}

if [ -n "$DEVICE_NAME" ]; then
  UDID=$(resolve_udid_by_name "$DEVICE_NAME")
else
  UDID=$(xcrun simctl list devices booted | grep -oE "$UDID_RE" | head -1 || true)
  if [ -n "$UDID" ]; then
    DEVICE_NAME="(booted)"
  else
    DEVICE_NAME="$DEFAULT_DEVICE"
    UDID=$(resolve_udid_by_name "$DEVICE_NAME")
  fi
fi

if [ -z "${UDID:-}" ]; then
  echo "✗ No simulator found for \"$DEVICE_NAME\". List them with:" >&2
  echo "    xcrun simctl list devices available" >&2
  exit 1
fi

free_port "$PORT"

echo "▶ Debug + live reload · Metro :$PORT · $DEVICE_NAME [$UDID]"
exec npx expo run:ios --configuration Debug --port "$PORT" --device "$UDID" ${EXTRA[@]+"${EXTRA[@]}"}
