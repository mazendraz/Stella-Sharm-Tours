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
# The website must show what the API serves: prices and withdrawn trips
# (audit 2026-11-24 BUG-06). Exit 1 = stale beyond the cache window.
consistency=0
compose exec -T web node --input-type=module - <"$(dirname -- "$0")/cache-consistency.mjs" || consistency=$?
if [[ "$consistency" -eq 1 ]]; then
  echo 'Website shows content that differs from the API (cache not refreshing)' >&2
  exit 1
elif [[ "$consistency" -ne 0 ]]; then
  echo 'WARNING: website/API consistency could not be checked.' >&2
fi
used=$(df -P "$DATA_DIR" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
[[ "$used" -lt 80 ]] || { echo 'Disk utilization at or above 80%' >&2; exit 1; }
if [[ "$ENVIRONMENT" == production ]]; then
  [[ -f "$DATA_DIR/backups/last-success" && $(find "$DATA_DIR/backups/last-success" -mmin -1560 -print) ]] || { echo 'Database backup overdue' >&2; exit 1; }
  # Production needs an encrypted off-site copy (audit INF-02); losing the VPS
  # must never mean losing the bookings. TODO(INF-02): remove the opt-out once
  # restic is configured on the server (see docs/RUNBOOK.md).
  if [[ "${OFFSITE_BACKUP:-required}" == pending ]]; then
    # Explicit, temporary operator opt-out set in compose.env until restic is configured.
    echo 'WARNING: off-site backup not configured yet (OFFSITE_BACKUP=pending); local dumps only.' >&2
  else
    [[ -f "$DATA_DIR/backups/last-offsite-success" && $(find "$DATA_DIR/backups/last-offsite-success" -mmin -1560 -print) ]] || { echo 'Encrypted off-site backup overdue/unconfigured (set OFFSITE_BACKUP=pending in compose.env to defer)' >&2; exit 1; }
  fi
  # Failures must reach a person, not only the local journal (audit INF-01).
  # The file is root-only (0600); its directory must stay traversable (0711).
  # TODO(INF-01): make a missing webhook fatal once it is installed on the server.
  if [[ ! -s "${STELLA_ALERT_WEBHOOK_FILE:-/etc/stella/alerts/webhook-url}" ]]; then
    echo 'WARNING: operator alert webhook not configured; failures reach the journal only.' >&2
  fi
fi
echo 'Operational checks passed.'
