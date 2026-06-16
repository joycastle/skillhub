#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECURITY_WORKFLOW="$REPO_ROOT/.github/workflows/security.yml"
PR_SCRIPTS_WORKFLOW="$REPO_ROOT/.github/workflows/pr-scripts.yml"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[[ -f "$SECURITY_WORKFLOW" ]] || fail ".github/workflows/security.yml is required"

grep -Eq '^permissions:[[:space:]]*$' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts must declare top-level permissions"
grep -Eq '^[[:space:]]+contents:[[:space:]]+read[[:space:]]*$' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts GITHUB_TOKEN permissions must be read-only"
grep -Fq 'persist-credentials: false' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts checkout must not persist credentials"

grep -Fq 'actions/dependency-review-action' "$SECURITY_WORKFLOW" \
  || fail "security workflow must run dependency review"
grep -Fq 'github/codeql-action/init' "$SECURITY_WORKFLOW" \
  || fail "security workflow must initialize CodeQL"
grep -Fq 'cd server && ./mvnw -q -DskipTests package' "$SECURITY_WORKFLOW" \
  || fail "security workflow must build Java with the server Maven wrapper"
grep -Fq 'security-events: write' "$SECURITY_WORKFLOW" \
  || fail "security workflow must grant SARIF upload permission"

grep -Fq '.github/workflows/security.yml' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts must run when security workflow changes"
grep -Fq 'bash scripts/tests/validate-release-config-test.sh' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts must run validate-release-config-test"
grep -Fq 'bash scripts/tests/runtime-secret-test.sh' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts must run runtime-secret-test"
grep -Fq 'bash scripts/tests/dev-web-host-test.sh' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts must run dev-web-host-test"
grep -Fq 'bash scripts/tests/workflow-security-test.sh' "$PR_SCRIPTS_WORKFLOW" \
  || fail "pr-scripts must run workflow-security-test"

echo "workflow-security-test passed"
