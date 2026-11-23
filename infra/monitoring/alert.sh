#!/usr/bin/env bash
set -euo pipefail
unit=${1:?Specify the failed unit}
[[ "$unit" =~ ^[a-zA-Z0-9_@.:-]{1,128}$ ]] || exit 2
logger -p daemon.crit -- "Stella unit $unit failed; inspect journalctl"

credential=${STELLA_ALERT_WEBHOOK_FILE:-/etc/stella/alerts/webhook-url}
if [[ ! -s "$credential" ]]; then
  # Staging may rely on the journal; production must reach an operator (audit INF-01).
  [[ "$unit" != *@production.* ]] || { logger -p daemon.crit -- 'Stella production alert webhook missing'; exit 1; }
  exit 0
fi
IFS= read -r url < "$credential" || [[ -n "${url:-}" ]]
[[ "$url" =~ ^https://[a-zA-Z0-9._-]+(/[a-zA-Z0-9._~:/%?\&=+@-]*)?$ ]] || exit 2
payload=$(printf '{"event":"stella_unit_failed","unit":"%s"}' "$unit")
# Send only the unit name. Suppress remote bodies and keep the URL out of argv.
if ! printf 'url = "%s"\n' "$url" | curl --config - --proto '=https' \
  --silent --fail --output /dev/null --max-time 8 --retry 2 --retry-max-time 20 \
  --header 'Content-Type: application/json' --data-binary "$payload"; then
  logger -p daemon.err -- 'Stella external operational alert delivery failed'
  exit 1
fi
