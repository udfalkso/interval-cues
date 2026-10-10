#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/runplanner-audio-tests.XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT
swiftc -module-cache-path "$TEST_DIR/cache" \
  "$ROOT_DIR/modules/workout-audio/ios/CueSchedule.swift" \
  "$ROOT_DIR/test/native/main.swift" -o "$TEST_DIR/audio-tests"
"$TEST_DIR/audio-tests"
