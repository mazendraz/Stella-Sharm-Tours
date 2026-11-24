#!/usr/bin/env bash
# Regression for audit 2026-11-24 BUG-05: a trip that staff unpublish must stay
# unavailable on the website after the web container restarts (every deploy
# restarts it). Runs only against the local/CI verification stack
# (compose project stella-integration-verify). The trip is always re-published.
set -euo pipefail
slug=${1:-glass-bottom-boat}
project=stella-integration-verify
web=http://localhost:4983
api=http://127.0.0.1:4984
[[ "$(docker inspect -f '{{.State.Running}}' "$project-postgres-1")" == true ]] || {
  echo 'Verification stack is not running' >&2
  exit 2
}
query() {
  # shellcheck disable=SC2016 # expanded inside the container
  docker exec "$project-postgres-1" sh -c 'psql -U "$POSTGRES_USER" -d stella_prod -At -v ON_ERROR_STOP=1 -c "$0"' "$1"
}
revalidate() {
  docker exec "$project-worker-1" node -e 'fetch(process.env.WEB_REVALIDATE_URL,{method:"POST",headers:{"Content-Type":"application/json","X-Revalidate-Secret":process.env.WEB_REVALIDATE_SECRET},body:JSON.stringify({tags:process.argv.slice(1)})}).then(r=>{if(!r.ok)process.exit(1)})' "$@"
}
status() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
wait_web() {
  for _ in $(seq 1 60); do
    [[ "$(docker inspect -f '{{.State.Health.Status}}' "$project-web-1")" == healthy ]] && return 0
    sleep 2
  done
  echo 'Web did not become healthy' >&2
  return 1
}
[[ "$slug" =~ ^[a-z0-9-]{1,120}$ ]] || exit 2
[[ "$(query "select status from trips where slug='$slug'")" == published ]] || {
  echo "Trip $slug is not published" >&2
  exit 2
}
restore() {
  query "update trips set status='published' where slug='$slug'" >/dev/null
  revalidate "trip:$slug" catalog
}
trap restore EXIT
page="$web/en/t/$slug"
failures=0
expect() {
  local label=$1 want=$2 got=$3
  if [[ "$got" == "$want" ]]; then echo "ok   $label ($got)"; else
    echo "FAIL $label: expected $want, got $got"
    failures=$((failures + 1))
  fi
}
expect 'published page' 200 "$(status "$page")"
query "update trips set status='draft' where slug='$slug'" >/dev/null
revalidate "trip:$slug"
sleep 1
expect 'unpublished page' 404 "$(status "$page")"
docker restart "$project-web-1" >/dev/null
wait_web
expect 'unpublished page after web restart' 404 "$(status "$page")"
sleep 5
expect 'unpublished page after restart (stale-while-revalidate)' 404 "$(status "$page")"
if curl -s "$web/sitemap.xml" | grep -q "/en/t/$slug<"; then
  echo 'FAIL sitemap still lists the unpublished trip'
  failures=$((failures + 1))
else echo 'ok   sitemap omits the unpublished trip'; fi
expect 'API agrees' 404 "$(status "$api/v1/public/trips/$slug?locale=en")"
((failures == 0))
