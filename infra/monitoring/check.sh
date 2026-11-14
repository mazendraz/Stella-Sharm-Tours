#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname -- "$0")/../lib.sh"
load_environment "${1:?Choose production or staging}"
if [[ -f "$STATE_DIR/current" && -z "${RELEASE:-}" ]]; then export RELEASE; RELEASE=$(read_release "$STATE_DIR/current"); fi
for service in api worker web admin caddy postgres; do
  container=$(compose ps -q "$service")
  [[ -n "$container" && $(docker inspect --format '{{.State.Health.Status}}' "$container") == healthy ]] || { echo "Unhealthy service: $service" >&2; exit 1; }
done
used=$(df -P "$DATA_DIR" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
[[ "$used" -lt 80 ]] || { echo 'Disk utilization at or above 80%' >&2; exit 1; }
if [[ "$ENVIRONMENT" == production ]]; then
  [[ -f "$DATA_DIR/backups/last-success" && $(find "$DATA_DIR/backups/last-success" -mmin -1560 -print) ]] || { echo 'Database backup overdue' >&2; exit 1; }
  [[ -f "$DATA_DIR/backups/last-offsite-success" && $(find "$DATA_DIR/backups/last-offsite-success" -mmin -1560 -print) ]] || { echo 'Encrypted off-site backup overdue/unconfigured' >&2; exit 1; }
fi
echo 'Operational checks passed.'
