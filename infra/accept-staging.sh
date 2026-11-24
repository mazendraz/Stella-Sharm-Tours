#!/usr/bin/env bash
# Record that the release currently running in staging was accepted by a
# person. Production deploys refuse any commit without this record (audit
# 2026-11-24 SEC-02). Run on the VPS after the manual staging checks:
#   bash infra/accept-staging.sh <40-character SHA>
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname -- "$0")/lib.sh"
sha=${1:?Usage: accept-staging.sh SHA}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || { echo 'Only 40-character commit SHAs are accepted' >&2; exit 1; }
load_environment staging
lock_environment
current=$(read_release "$STATE_DIR/current") || { echo 'Staging has no recorded release' >&2; exit 1; }
[[ "$current" == "$sha" ]] || { echo "Staging runs $current, not $sha; deploy and test that commit first" >&2; exit 1; }
bash "$STELLA_REPO/infra/monitoring/check.sh" staging
accepted="$STATE_DIR/accepted"
mkdir -p -- "$accepted"
chmod 700 -- "$accepted"
(
  umask 077
  printf 'accepted_at=%s\naccepted_by=%s\n' "$(date -u +%FT%TZ)" "${SUDO_USER:-${USER:-unknown}}" > "$accepted/$sha.tmp"
  mv -- "$accepted/$sha.tmp" "$accepted/$sha"
)
echo "Staging acceptance recorded for $sha"
