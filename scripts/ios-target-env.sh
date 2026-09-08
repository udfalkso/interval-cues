#!/usr/bin/env bash
#
# Per-target settings for Intervals iOS builds. Intervals has no backend, so a
# "target" only selects TestFlight "What to Test" notes (and optionally sources
# a .env.<target> if you ever add build-time EXPO_PUBLIC_* vars).

apply_ios_target_env() {
  local target="${1:-production}"
  local env_file=""

  case "${target}" in
    production|release|"")
      env_file="${INTERVALS_ROOT_DIR}/.env.production"
      export ASC_TEST_NOTES="${ASC_TEST_NOTES_PRODUCTION:-${ASC_TEST_NOTES:-}}"
      ;;
    staging|qa)
      env_file="${INTERVALS_ROOT_DIR}/.env.staging"
      export ASC_TEST_NOTES="${ASC_TEST_NOTES_STAGING:-${ASC_TEST_NOTES:-}}"
      ;;
    *)
      printf 'Unknown iOS target: %s\nExpected one of: production, staging\n' "${target}" >&2
      return 2
      ;;
  esac

  echo "Target: ${target:-production}"
  # Sourcing is optional — Intervals ships with no required build-time env.
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${env_file}"
    set +a
    echo "  (loaded ${env_file})"
  fi
}
