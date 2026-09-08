#!/usr/bin/env bash
#
# One command to ship Intervals to TestFlight: archive -> export -> upload.
#
#   yarn ios:testflight                        # production, auto build number
#   yarn ios:testflight production path/to.ipa # upload an existing .ipa
#
# TestFlight "What to Test" notes: set ASC_TEST_NOTES (+ ASC_TEST_NOTES_LOCALE,
# default en-US), e.g. in .env.release.local.

set -euo pipefail

announce_failure() { [[ "$1" -ne 0 ]] && command -v say >/dev/null 2>&1 && say "TestFlight release broke." >/dev/null 2>&1 || true; }
trap 'announce_failure "$?"' EXIT

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/release-env.sh
source "${ROOT_DIR}/scripts/release-env.sh"
# shellcheck source=scripts/ios-target-env.sh
source "${ROOT_DIR}/scripts/ios-target-env.sh"

IOS_TARGET="production"
IPA_PATH=""
case "${1:-}" in
  staging|qa|production|release) IOS_TARGET="$1"; IPA_PATH="${2:-}" ;;
  *.ipa) IPA_PATH="$1" ;;
  "") ;;
  *) IOS_TARGET="$1" ;;
esac

apply_ios_target_env "${IOS_TARGET}"
require_env ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_PATH APP_VERSION
prefer_asc_env_credentials

if [[ -z "${IPA_PATH}" ]]; then
  resolve_ios_build_number
  "${ROOT_DIR}/scripts/ios-archive.sh" "${IOS_TARGET}"
  announce "Archive finished"
  "${ROOT_DIR}/scripts/ios-export.sh" "${IOS_TARGET}"
  announce "Export finished"
  IPA_PATH="$(find "${IOS_EXPORT_PATH}" -maxdepth 1 -name '*.ipa' -print | head -n 1)"
fi

if [[ ! -f "${IPA_PATH}" ]]; then
  echo "No .ipa to upload at: ${IPA_PATH}" >&2
  exit 1
fi

upload_args=(builds upload --app "${ASC_APP_ID}" --ipa "${IPA_PATH}" --wait)
[[ -n "${INTERVALS_IOS_BUILD_NUMBER:-}" ]] && upload_args+=(--version "${APP_VERSION}" --build-number "${INTERVALS_IOS_BUILD_NUMBER}")

if [[ -n "${ASC_TEST_NOTES:-}" ]]; then
  upload_args+=(--test-notes "${ASC_TEST_NOTES}" --locale "${ASC_TEST_NOTES_LOCALE:-en-US}")
fi

echo "Uploading ${IPA_PATH} to TestFlight (app ${ASC_APP_ID})..."
asc "${upload_args[@]}"

announce "TestFlight upload finished"
echo "Done. Build will finish processing in App Store Connect, then reach your device via TestFlight."
