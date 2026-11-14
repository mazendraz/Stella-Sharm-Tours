#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname -- "$0")/lib.sh"
load_environment "${1:?Usage: deploy.sh production|staging SHA|--rollback}"
lock_environment
requested=${2:?Supply immutable SHA or --rollback}
previous=''
if [[ -f "$STATE_DIR/current" ]]; then previous=$(read_release "$STATE_DIR/current"); fi
if [[ "$requested" == --rollback ]]; then
  requested=$(read_release "$STATE_DIR/previous")
  rollback=true
else
  rollback=false
fi
[[ "$requested" =~ ^[a-f0-9]{40}$ ]] || { echo 'Only 40-character commit SHAs are accepted' >&2; exit 1; }
export RELEASE=$requested
export PROXY_CONFIG_DIR="$STATE_DIR/$requested/proxy"
if [[ ! -d "$PROXY_CONFIG_DIR" ]]; then
  [[ "$rollback" == false ]] || { echo 'Proxy snapshot missing; rollback refused' >&2; exit 1; }
  mkdir -p "$PROXY_CONFIG_DIR"
  cp "$STELLA_REPO/infra/Caddyfile" "$STELLA_REPO/infra/Caddyfile.staging" "$PROXY_CONFIG_DIR/"
  cp -a "$STELLA_REPO/infra/caddy" "$PROXY_CONFIG_DIR/caddy"
fi
compose config --quiet
compose pull api worker web admin caddy postgres
if [[ "$ENVIRONMENT" == production ]]; then
  [[ "$WEB_HOST" != *example* && "$WEB_HOST" != *.invalid && "$WEB_HOST" != *.test ]] || { echo 'Real production DNS required' >&2; exit 1; }
  label=$(docker image inspect "$IMAGE_PREFIX/stella-admin:$RELEASE" --format '{{index .Config.Labels "org.stella.admin-ui"}}')
  [[ "$label" != operational-scaffold ]] || { echo 'Production blocked: complete file 05 dashboard first' >&2; exit 1; }
fi
docker network inspect stella_gateway >/dev/null 2>&1 || docker network create --subnet 172.30.19.0/24 stella_gateway >/dev/null
compose up -d --wait postgres
bash "$STELLA_REPO/infra/backup/backup.sh" "$ENVIRONMENT"
if [[ "$rollback" == false ]]; then
  # Expand/contract migrations only. Never roll the schema backwards automatically.
  compose run --rm --no-deps migrate
fi
recover() {
  if [[ -n "$previous" ]]; then
    export RELEASE=$previous
    export PROXY_CONFIG_DIR="$STATE_DIR/$previous/proxy"
    if compose up -d --wait --wait-timeout 180 api worker web admin caddy; then
      echo 'Previous images restored; database retained. Inspect the failed release.' >&2
    else
      echo 'Rollback health failed: manual incident response required.' >&2
    fi
  else
    compose stop caddy worker api web admin || true
    echo 'First deployment failed; application services stopped. Database retained.' >&2
  fi
}
if ! compose up -d --wait --wait-timeout 180 api worker web admin caddy; then
  recover
  exit 1
fi
if ! compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile; then
  recover
  exit 1
fi
if ! bash "$STELLA_REPO/infra/monitoring/check.sh" "$ENVIRONMENT"; then
  recover
  exit 1
fi
if [[ -n "$previous" && "$previous" != "$requested" ]]; then record_release "$STATE_DIR/previous" "$previous"; fi
record_release "$STATE_DIR/current" "$requested"
echo "Healthy $ENVIRONMENT release: $requested"
