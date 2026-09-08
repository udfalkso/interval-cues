#!/usr/bin/env bash
#
# Regenerate the native ios/ project from the Expo config (runs pod install
# too). Only needed when native config changes (plugins, entitlements, native
# deps) — pure JS changes are picked up by the archive's bundling step.
#
#   yarn ios:prebuild            # sync native project
#   yarn ios:prebuild --clean    # wipe and regenerate ios/ from scratch

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

npx expo prebuild -p ios "$@"
