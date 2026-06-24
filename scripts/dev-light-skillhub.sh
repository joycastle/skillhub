#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SKILLHUB_LIGHT_ENV_FILE:-$ROOT_DIR/.env.light}"

usage() {
  cat <<'EOF' >&2
Usage:
  scripts/dev-light-skillhub.sh deps      # start Postgres/Redis/MinIO/Scanner
  scripts/dev-light-skillhub.sh backend   # run backend in foreground
  scripts/dev-light-skillhub.sh frontend  # run frontend in foreground
  scripts/dev-light-skillhub.sh all       # run existing make dev-all
  scripts/dev-light-skillhub.sh down      # stop local services

First-time setup:
  cp .env.light.example .env.light
  edit .env.light
EOF
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    echo "Create it with: cp .env.light.example .env.light" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

cmd="${1:-}"
case "$cmd" in
  deps)
    load_env
    cd "$ROOT_DIR"
    docker compose -p skillhub up -d --wait --remove-orphans
    ;;
  backend)
    load_env
    cd "$ROOT_DIR/server"
    exec ./scripts/run-dev-app.sh
    ;;
  frontend)
    load_env
    cd "$ROOT_DIR/web"
    exec pnpm exec vite --host 127.0.0.1 --strictPort
    ;;
  all)
    load_env
    cd "$ROOT_DIR"
    exec make dev-all
    ;;
  down)
    cd "$ROOT_DIR"
    make dev-all-down
    ;;
  *)
    usage
    exit 2
    ;;
esac
