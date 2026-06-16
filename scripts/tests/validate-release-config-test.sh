#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/validate-release-config.sh"

TMP_DIRS=()
cleanup() {
  local d
  for d in "${TMP_DIRS[@]+"${TMP_DIRS[@]}"}"; do
    rm -rf "$d"
  done
}
trap cleanup EXIT

new_tmp() {
  local d
  d="$(mktemp -d)"
  TMP_DIRS+=("$d")
  echo "$d"
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

write_env() {
  local file="$1"
  local secret="${2:-}"
  local include_secret="${3:-yes}"
  cat >"$file" <<EOF
SKILLHUB_PUBLIC_BASE_URL=https://skillhub.example.com
POSTGRES_DB=skillhub
POSTGRES_USER=skillhub
POSTGRES_PASSWORD=strong-postgres-password
SESSION_COOKIE_SECURE=true
BOOTSTRAP_ADMIN_ENABLED=false
SKILLHUB_STORAGE_PROVIDER=s3
SKILLHUB_STORAGE_S3_ENDPOINT=https://storage.example.com
SKILLHUB_STORAGE_S3_BUCKET=skillhub
SKILLHUB_STORAGE_S3_ACCESS_KEY=release-access-key
SKILLHUB_STORAGE_S3_SECRET_KEY=release-secret-key
SKILLHUB_STORAGE_S3_REGION=us-east-1
SKILLHUB_STORAGE_S3_FORCE_PATH_STYLE=false
SKILLHUB_STORAGE_S3_AUTO_CREATE_BUCKET=false
EOF
  if [[ "$include_secret" == "yes" ]]; then
    printf 'SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET=%s\n' "$secret" >>"$file"
  fi
}

expect_fail() {
  local file="$1"
  local expected="$2"
  local output
  if output="$("$SCRIPT" "$file" 2>&1)"; then
    fail "expected validation to fail for $file"
  fi
  if [[ "$output" != *"$expected"* ]]; then
    fail "expected output to contain '$expected', got: $output"
  fi
}

tmp="$(new_tmp)"

valid_env="$tmp/valid.env"
write_env "$valid_env" "release-download-secret-32-bytes-minimum"
"$SCRIPT" "$valid_env" >/dev/null

missing_env="$tmp/missing.env"
write_env "$missing_env" "" no
expect_fail "$missing_env" "SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET is required"

placeholder_env="$tmp/placeholder.env"
write_env "$placeholder_env" "change-me-in-production"
expect_fail "$placeholder_env" "SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET still uses placeholder/default value"

short_env="$tmp/short.env"
write_env "$short_env" "too-short"
expect_fail "$short_env" "SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET must be at least 32 characters"

draft_env="$tmp/draft.env"
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET=*)
      printf '%s\n' "SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET=release-download-secret-32-bytes-minimum"
      ;;
    *)
      printf '%s\n' "$line"
      ;;
  esac
done <"$REPO_ROOT/.env.release.draft" >"$draft_env"
expect_fail "$draft_env" "POSTGRES_PASSWORD"

echo "validate-release-config-test passed"
