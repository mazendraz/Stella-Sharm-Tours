#!/usr/bin/env bash
# AUDIT-T05 — BUG-05: withdrawn content reappears after a web restart/deploy.
#
# Runs ONLY against the local verification stack started by
# `pnpm infra:verify:setup` (compose project stella-integration-verify,
# ports 4983/4984/4991). It temporarily unpublishes one trip and ALWAYS
# re-publishes it at the end (trap), then revalidates the web cache.
#
# Expected (correct behaviour): S2 and S3 print 404.
# Observed 2026-11-24 on commit 56a4319: S1=404, S2=200, S3=200.
set -euo pipefail
SLUG=${1:-glass-bottom-boat}
P=stella-integration-verify
[[ "$(docker inspect -f '{{.State.Running}}' $P-postgres-1)" == true ]] || { echo 'verification stack not running'; exit 2; }
q() { docker exec $P-postgres-1 sh -c "psql -U \"\$POSTGRES_USER\" -d stella_prod -At -c \"$1\""; }
reval() { docker exec $P-worker-1 node -e 'fetch(process.env.WEB_REVALIDATE_URL,{method:"POST",headers:{"Content-Type":"application/json","X-Revalidate-Secret":process.env.WEB_REVALIDATE_SECRET},body:JSON.stringify({tags:process.argv.slice(1)})}).then(r=>{if(!r.ok)process.exit(1)})' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
waitweb() { for _ in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' $P-web-1)" == healthy ]] && return; sleep 2; done; }
PAGE=http://localhost:4983/en/t/$SLUG
API="http://127.0.0.1:4984/v1/public/trips/$SLUG?locale=en"
restore() { q "update trips set status='published' where slug='$SLUG'" >/dev/null; reval "trip:$SLUG" catalog; echo "restored: $(q "select status from trips where slug='$SLUG'") page=$(code "$PAGE")"; }
trap restore EXIT
[[ "$(q "select status from trips where slug='$SLUG'")" == published ]] || { echo "trip $SLUG not published; choose another"; trap - EXIT; exit 2; }
code "$PAGE" >/dev/null   # make sure a 200 entry exists in the persistent fetch cache
echo "S0 published:                 page=$(code "$PAGE") api=$(code "$API")"
q "update trips set status='draft' where slug='$SLUG'" >/dev/null
reval "trip:$SLUG"; sleep 1
echo "S1 unpublished+revalidated:   page=$(code "$PAGE") api=$(code "$API")"
docker restart $P-web-1 >/dev/null; waitweb
echo "S2 after web restart:         page=$(code "$PAGE") again=$(code "$PAGE") api=$(code "$API")"
sleep 65
echo "S3 +65 s (revalidate=60):     page=$(code "$PAGE") api=$(code "$API")"
