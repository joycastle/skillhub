#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/runtime.sh"

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

install_fake_tools() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"
  cat >"$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${DOCKER_LOG:?DOCKER_LOG is required}"
if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then
  exit 0
fi
exit 0
EOF
  chmod +x "$bin_dir/docker"

  cat >"$bin_dir/openssl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "rand" && "${2:-}" == "-hex" && "${3:-}" == "32" ]]; then
  printf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n'
  exit 0
fi
echo "unsupported openssl args: $*" >&2
exit 1
EOF
  chmod +x "$bin_dir/openssl"
}

run_runtime() {
  local home="$1"
  local bin_dir="$2"
  local stdout="$3"
  DOCKER_LOG="$home/docker.log" \
    SKILLHUB_HOME="$home" \
    SKILLHUB_RAW_BASE="file://$REPO_ROOT" \
    PATH="$bin_dir:$PATH" \
    sh "$SCRIPT" up --version sha-test --public-url http://localhost >"$stdout"
}

tmp="$(new_tmp)"
bin_dir="$tmp/bin"
install_fake_tools "$bin_dir"

home_generated="$tmp/generated"
stdout_generated="$tmp/generated.out"
mkdir -p "$home_generated"
run_runtime "$home_generated" "$bin_dir" "$stdout_generated"

generated_secret="$(grep '^SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET=' "$home_generated/.env.release" | cut -d= -f2-)"
[[ "$generated_secret" == "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" ]] \
  || fail "runtime should generate a persisted anonymous download secret"
grep -Fq "Generated SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET" "$stdout_generated" \
  || fail "runtime should explain that it generated the secret"
if grep -Fq "$generated_secret" "$stdout_generated"; then
  fail "runtime must not print the generated secret value"
fi

home_preserved="$tmp/preserved"
stdout_preserved="$tmp/preserved.out"
mkdir -p "$home_preserved"
cat >"$home_preserved/.env.release" <<'EOF'
SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET=already-valid-runtime-secret-32-bytes
EOF
run_runtime "$home_preserved" "$bin_dir" "$stdout_preserved"

preserved_secret="$(grep '^SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET=' "$home_preserved/.env.release" | cut -d= -f2-)"
[[ "$preserved_secret" == "already-valid-runtime-secret-32-bytes" ]] \
  || fail "runtime must preserve an existing valid anonymous download secret"
if grep -Fq "Generated SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET" "$stdout_preserved"; then
  fail "runtime must not regenerate an existing valid secret"
fi

echo "runtime-secret-test passed"
