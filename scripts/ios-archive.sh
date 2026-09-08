#!/usr/bin/env bash
#
# Archive Intervals for release. Build number + marketing version are passed to
# xcodebuild directly (and stamped into Info.plist) so we never depend on
# whatever Expo baked in.
#
#   yarn ios:archive              # production target

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/release-env.sh
source "${ROOT_DIR}/scripts/release-env.sh"
# shellcheck source=scripts/ios-target-env.sh
source "${ROOT_DIR}/scripts/ios-target-env.sh"

apply_ios_target_env "${1:-production}"
set_xcodebuild_auth_args
resolve_ios_build_number

# The native project must exist to archive. Generate it if it's missing.
if [[ ! -d "${IOS_WORKSPACE}" ]]; then
  echo "No ${IOS_WORKSPACE} — running expo prebuild first..."
  "${ROOT_DIR}/scripts/ios-prebuild.sh"
fi

# Expo's prebuild writes a literal CFBundleVersion into Info.plist, so stamp the
# resolved values straight in to keep the binary matching what we tell ASC.
IOS_INFO_PLIST="${ROOT_DIR}/ios/${IOS_SCHEME}/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${INTERVALS_IOS_BUILD_NUMBER}" "${IOS_INFO_PLIST}"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${APP_VERSION}" "${IOS_INFO_PLIST}"
echo "Stamped ${IOS_INFO_PLIST}: CFBundleVersion=${INTERVALS_IOS_BUILD_NUMBER}, CFBundleShortVersionString=${APP_VERSION}"

mkdir -p "$(dirname "${IOS_ARCHIVE_PATH}")"

xcodebuild_args=(
  clean archive
  -workspace "${IOS_WORKSPACE}"
  -scheme "${IOS_SCHEME}"
  -configuration Release
  -sdk iphoneos
  -destination "generic/platform=iOS"
  -archivePath "${IOS_ARCHIVE_PATH}"
  "DEVELOPMENT_TEAM=${IOS_DEVELOPMENT_TEAM}"
  "CURRENT_PROJECT_VERSION=${INTERVALS_IOS_BUILD_NUMBER}"
  "MARKETING_VERSION=${APP_VERSION}"
)
xcodebuild_args+=("${XCODEBUILD_AUTH_ARGS[@]}")
xcodebuild_args+=(-allowProvisioningUpdates)

xcodebuild "${xcodebuild_args[@]}"

echo "Archive: ${IOS_ARCHIVE_PATH}"
