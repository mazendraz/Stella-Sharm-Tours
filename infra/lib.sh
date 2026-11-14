#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail
STELLA_REPO=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
load_environment() {
  local target=${1:?Choose production or staging}
  [[ "$target" == production || "$target" == staging ]] || { echo 'Invalid environment' >&2; return 1; }
  STELLA_ROOT=${STELLA_ROOT:-/srv/stella}
  [[ "$STELLA_ROOT" == /* && -d "$STELLA_ROOT/$target" ]] || { echo 'Environment not configured' >&2; return 1; }
  local root resolved
  root=$(realpath -e -- "$STELLA_ROOT")
  resolved=$(realpath -e -- "$STELLA_ROOT/$target")
  [[ "$resolved" == "$root/$target" ]] || { echo 'Environment symlink refused' >&2; return 1; }
  STELLA_ROOT=$root
  export ENVIRONMENT=$target
  local config="$resolved/compose.env"
  local requested_release=${RELEASE:-}
  [[ -f "$config" && ! -L "$config" && $(stat -c %a "$config") == 600 && -O "$config" ]] || { echo 'Compose config must be owned by deploy user, mode 600' >&2; return 1; }
  # Trusted owner-only generated shell assignments; never source user uploads.
  set -a
  # shellcheck disable=SC1090
  source "$config"
  set +a
  [[ "$DATA_DIR" == "$resolved" && "$ENV_DIR" == "$resolved/env" && "$COMPOSE_PROJECT_NAME" == "stella-$target" ]] || { echo 'Cross-environment configuration refused' >&2; return 1; }
  [[ "$POSTGRES_DB" == "stella_prod" && "$target" == production || "$POSTGRES_DB" == "stella_staging" && "$target" == staging ]] || { echo 'Database/environment mismatch' >&2; return 1; }
  COMPOSE=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$config" -f "$STELLA_REPO/infra/docker-compose.prod.yml")
  if [[ "$target" == staging ]]; then COMPOSE+=(-f "$STELLA_REPO/infra/docker-compose.staging.yml"); fi
  STATE_DIR="$resolved/releases"
  mkdir -p -- "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  if [[ -n "$requested_release" ]]; then
    export RELEASE=$requested_release
  elif [[ -f "$STATE_DIR/current" ]]; then
    export RELEASE
    RELEASE=$(read_release "$STATE_DIR/current")
  fi
  if [[ -z ${PROXY_CONFIG_DIR:-} && -d "$STATE_DIR/$RELEASE/proxy" ]]; then
    export PROXY_CONFIG_DIR="$STATE_DIR/$RELEASE/proxy"
  fi
}
compose() { "${COMPOSE[@]}" "$@"; }
lock_environment() {
  local lock_file="$DATA_DIR/deploy.lock"
  # Child restores/backups inherit this open file description and its lock.
  if [[ $(readlink "/proc/$$/fd/9" 2>/dev/null || true) != "$lock_file" ]]; then
    exec 9>"$lock_file"
  fi
  flock -n 9 || { echo 'Deployment/restore/backup already running' >&2; return 1; }
}
read_release() {
  local file=$1
  [[ -f "$file" ]] || return 1
  local value
  value=$(cat -- "$file")
  [[ "$value" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid recorded release SHA' >&2; return 1; }
  printf '%s' "$value"
}
record_release() {
  local file=$1 value=$2
  [[ "$value" =~ ^[a-f0-9]{40}$ ]] || return 1
  (umask 077; printf '%s\n' "$value" > "$file.tmp"; mv -- "$file.tmp" "$file")
}
