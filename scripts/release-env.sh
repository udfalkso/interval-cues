#!/usr/bin/env bash
#
# Shared environment + helpers for the Intervals iOS release scripts.
# Ported from the eden app's release tooling (local xcodebuild archive +
# `asc builds upload`), wired to Udi's personal Apple account.
#
# Precedence: real environment variables win over .env.release.local, which
# wins over the defaults below. Put your account-specific values (the new
# ASC app id, the ASC API key id / issuer / .p8 path) in .env.release.local —
# it is gitignored. See .env.release.local.example.

set -euo pipefail

INTERVALS_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export INTERVALS_ROOT_DIR

# Names .env.release.local may set, but only if not already in the real
# environment (captured here, restored after sourcing the file).
RELEASE_ENV_OVERRIDE_NAMES=(
  ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_PATH ASC_PROFILE
  ASC_TEST_NOTES ASC_TEST_NOTES_LOCALE
  ASC_TEST_NOTES_STAGING ASC_TEST_NOTES_PRODUCTION
  APP_VERSION IOS_SCHEME IOS_WORKSPACE IOS_DEVELOPMENT_TEAM
  IOS_ARCHIVE_PATH IOS_EXPORT_PATH IOS_EXPORT_OPTIONS_PLIST
  INTERVALS_IOS_BUILD_NUMBER
)

_capture_env_override() {
  local name="$1"
  if [[ -n "${!name+x}" ]]; then
    printf -v "INTERVALS_ENV_${name}_IS_SET" '%s' "1"
    printf -v "INTERVALS_ENV_${name}_VALUE" '%s' "${!name}"
  fi
}

_restore_env_override() {
  local name="$1"
  local is_set_name="INTERVALS_ENV_${name}_IS_SET"
  local value_name="INTERVALS_ENV_${name}_VALUE"
  if [[ -n "${!is_set_name:-}" ]]; then
    export "${name}=${!value_name}"
  fi
}

for name in "${RELEASE_ENV_OVERRIDE_NAMES[@]}"; do _capture_env_override "${name}"; done

if [[ -f "${INTERVALS_ROOT_DIR}/.env.release.local" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${INTERVALS_ROOT_DIR}/.env.release.local"
  set +a
fi

for name in "${RELEASE_ENV_OVERRIDE_NAMES[@]}"; do _restore_env_override "${name}"; done

# --- helpers ----------------------------------------------------------------

require_env() {
  local missing=0 name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      printf 'Missing required environment variable: %s\n' "${name}" >&2
      missing=1
    fi
  done
  return "${missing}"
}

announce() {
  echo "==> $1"
  if command -v say >/dev/null 2>&1; then say "$1" >/dev/null 2>&1 || true; fi
}

# When explicit API-key creds are present, use them (bypass the keychain).
prefer_asc_env_credentials() {
  if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_PRIVATE_KEY_PATH:-}" ]]; then
    unset ASC_PROFILE || true
    export ASC_BYPASS_KEYCHAIN="${ASC_BYPASS_KEYCHAIN:-1}"
  fi
}

# App Store Connect is the source of truth for build numbers.
resolve_ios_build_number() {
  if [[ -n "${INTERVALS_IOS_BUILD_NUMBER:-}" ]]; then return 0; fi
  require_env ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_PATH APP_VERSION
  prefer_asc_env_credentials

  INTERVALS_IOS_BUILD_NUMBER="$(
    asc builds latest --app "${ASC_APP_ID}" --version "${APP_VERSION}" \
      --platform IOS --next --initial-build-number 1 --output json \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["nextBuildNumber"])'
  )"
  export INTERVALS_IOS_BUILD_NUMBER
  echo "Using iOS build number: ${INTERVALS_IOS_BUILD_NUMBER} (version ${APP_VERSION})"
}

set_xcodebuild_auth_args() {
  XCODEBUILD_AUTH_ARGS=()
  if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_PRIVATE_KEY_PATH:-}" ]]; then
    if [[ ! -f "${ASC_PRIVATE_KEY_PATH}" ]]; then
      printf 'ASC_PRIVATE_KEY_PATH does not exist: %s\n' "${ASC_PRIVATE_KEY_PATH}" >&2
      return 1
    fi
    XCODEBUILD_AUTH_ARGS=(
      -authenticationKeyPath "${ASC_PRIVATE_KEY_PATH}"
      -authenticationKeyID "${ASC_KEY_ID}"
      -authenticationKeyIssuerID "${ASC_ISSUER_ID}"
    )
  fi
}

# --- Intervals defaults -----------------------------------------------------

# Udi's personal Apple Developer team (same account SwearBuy ships under).
export IOS_DEVELOPMENT_TEAM="${IOS_DEVELOPMENT_TEAM:-K5FGQ428RU}"
export IOS_SCHEME="${IOS_SCHEME:-Intervals}"
export IOS_WORKSPACE="${IOS_WORKSPACE:-${INTERVALS_ROOT_DIR}/ios/Intervals.xcworkspace}"

# ASC_APP_ID / ASC_KEY_ID / ASC_ISSUER_ID have NO defaults — set them in
# .env.release.local for this app (the app id is created once via asc; see
# .env.release.local.example and the plan).

# Marketing version from package.json (single source of truth).
if [[ -z "${APP_VERSION:-}" ]]; then
  APP_VERSION="$(python3 -c 'import json;print(json.load(open("'"${INTERVALS_ROOT_DIR}"'/package.json"))["version"])')"
  export APP_VERSION
fi

# Guard against the common mixup: ASC_KEY_ID must be the 10-char Key ID, not a
# path. The .p8 path belongs in ASC_PRIVATE_KEY_PATH.
if [[ -n "${ASC_KEY_ID:-}" && ( "${ASC_KEY_ID}" == */* || "${ASC_KEY_ID}" == *.p8 ) ]]; then
  echo "ASC_KEY_ID looks like a file path ('${ASC_KEY_ID}')." >&2
  echo "It must be the 10-character App Store Connect Key ID (e.g. ABC123XYZ9)." >&2
  echo "Put the .p8 file path in ASC_PRIVATE_KEY_PATH instead. See .env.release.local.example." >&2
  exit 1
fi

# xcodebuild and asc both expect the key at ~/.private_keys/AuthKey_<ID>.p8 by
# default; override with ASC_PRIVATE_KEY_PATH to point at the file directly.
if [[ -z "${ASC_PRIVATE_KEY_PATH:-}" && -n "${ASC_KEY_ID:-}" ]]; then
  export ASC_PRIVATE_KEY_PATH="${HOME}/.private_keys/AuthKey_${ASC_KEY_ID}.p8"
fi

# Fail early with a clear message if the resolved key file isn't there.
if [[ -n "${ASC_PRIVATE_KEY_PATH:-}" && ! -f "${ASC_PRIVATE_KEY_PATH}" ]]; then
  echo "ASC private key not found at: ${ASC_PRIVATE_KEY_PATH}" >&2
  echo "Set ASC_PRIVATE_KEY_PATH to your .p8, or place it at ~/.private_keys/AuthKey_\${ASC_KEY_ID}.p8" >&2
  exit 1
fi

export IOS_ARCHIVE_PATH="${IOS_ARCHIVE_PATH:-${INTERVALS_ROOT_DIR}/build/ios/archive/Intervals.xcarchive}"
export IOS_EXPORT_PATH="${IOS_EXPORT_PATH:-${INTERVALS_ROOT_DIR}/build/ios/export}"
export IOS_EXPORT_OPTIONS_PLIST="${IOS_EXPORT_OPTIONS_PLIST:-${INTERVALS_ROOT_DIR}/build/ios/ExportOptions.plist}"
