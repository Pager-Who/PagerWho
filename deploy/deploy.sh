#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-}"
shift || true
if [[ "$MODE" != dev && "$MODE" != prod ]]; then
  echo "Usage: deploy.sh dev|prod [--no-pull]" >&2
  exit 1
fi
# Compatibility with older instructions. Deployments never fetch or change Git.
if (( $# > 1 )) || { (( $# == 1 )) && [[ "$1" != --no-pull ]]; }; then
  echo "Unsupported deployment argument." >&2
  exit 1
fi
APP_DIR="${PAGERWHO_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$APP_DIR"
APP_DIR="$PWD"
if [[ "$MODE" == prod ]]; then
  ENV_FILE="${PAGERWHO_ENV_FILE:-$APP_DIR/.env}"
else
  ENV_FILE="${PAGERWHO_ENV_FILE:-$APP_DIR/deploy/dev/.env}"
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file. Copy deploy/$MODE/.env.example and configure it first." >&2
  exit 1
fi
ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
if [[ "$MODE" == prod && "$(stat -c '%a' "$ENV_FILE")" != 600 ]]; then
  echo "Production environment file must have permissions 600." >&2
  exit 1
fi
export PAGERWHO_ENV_FILE="$ENV_FILE"
export PAGERWHO_IMAGE_TAG="${PAGERWHO_IMAGE_TAG:-$(date -u +%Y%m%d%H%M%S)}"
if [[ ! "$PAGERWHO_IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
  echo "Invalid PAGERWHO_IMAGE_TAG." >&2
  exit 1
fi
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$APP_DIR/deploy/$MODE/docker-compose.yml")
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" build --pull api web
"${COMPOSE[@]}" run --rm --no-deps migrate node /app/deploy/validate-env.mjs "$MODE"
"${COMPOSE[@]}" run --rm --no-deps migrate
SERVICES=(api worker web)
if [[ "$MODE" == dev ]]; then SERVICES+=(nginx); fi
"${COMPOSE[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 180 "${SERVICES[@]}"
"${COMPOSE[@]}" ps
