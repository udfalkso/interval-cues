#!/usr/bin/env bash
#
# Export a signed .ipa from the archive. Generates an app-store-connect
# ExportOptions.plist on the fly if one isn't provided.
#
#   yarn ios:export              # production target

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/release-env.sh
source "${ROOT_DIR}/scripts/release-env.sh"
# shellcheck source=scripts/ios-target-env.sh
source "${ROOT_DIR}/scripts/ios-target-env.sh"

IOS_TARGET="${1:-production}"
apply_ios_target_env "${IOS_TARGET}"
set_xcodebuild_auth_args

if [[ ! -d "${IOS_ARCHIVE_PATH}" ]]; then
  "${ROOT_DIR}/scripts/ios-archive.sh" "${IOS_TARGET}"
fi

if [[ ! -f "${IOS_EXPORT_OPTIONS_PLIST}" ]]; then
  mkdir -p "$(dirname "${IOS_EXPORT_OPTIONS_PLIST}")"
  cat > "${IOS_EXPORT_OPTIONS_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>${IOS_DEVELOPMENT_TEAM}</string>
    <key>uploadSymbols</key>
    <true/>
    <key>destination</key>
    <string>export</string>
</dict>
</plist>
PLIST
fi

mkdir -p "${IOS_EXPORT_PATH}"

xcodebuild -exportArchive \
  -archivePath "${IOS_ARCHIVE_PATH}" \
  -exportPath "${IOS_EXPORT_PATH}" \
  -exportOptionsPlist "${IOS_EXPORT_OPTIONS_PLIST}" \
  "${XCODEBUILD_AUTH_ARGS[@]}" \
  -allowProvisioningUpdates

IPA_PATH="$(find "${IOS_EXPORT_PATH}" -maxdepth 1 -name '*.ipa' -print | head -n 1)"
if [[ -z "${IPA_PATH}" ]]; then
  echo "Export completed but no .ipa was found under ${IOS_EXPORT_PATH}." >&2
  exit 1
fi

echo "IPA: ${IPA_PATH}"
