#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd -P)
suite=$(mktemp -d /tmp/stella-operations.XXXXXX)
mkdir "$suite/bin"
cat > "$suite/bin/docker" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "${RELEASE:-none}" "$*" >> "$FAKE_TRACE"
case "$*" in
  'network inspect '*) exit 0 ;;
  'image inspect '*) echo complete; exit 0 ;;
  'inspect '*) echo healthy; exit 0 ;;
  *' exec -T postgres pg_dump '*) echo synthetic-private-dump; exit 0 ;;
  *' exec -T postgres pg_restore --list'*) cat >/dev/null; exit 0 ;;
  *' exec -T postgres pg_restore '*) cat >/dev/null; exit 0 ;;
  *' exec -T postgres psql '*' -tAc '*) echo 0; exit 0 ;;
  *' exec -T postgres psql '*)
    if [[ "$*" != *' -c '* ]]; then cat >/dev/null; fi
    [[ "${FAKE_SCRUB_FAIL:-0}" != 1 ]]; exit ;;
  *' run --rm --no-deps migrate') [[ "${FAKE_MIGRATE_FAIL:-0}" != 1 ]]; exit ;;
  *' up -d --wait --wait-timeout 180 api worker web admin caddy')
    if [[ "${RELEASE:-}" == "${FAKE_BLOCK_RELEASE:-disabled}" ]]; then
      touch "$STELLA_ROOT/deploy-started"
      for _ in $(seq 1 100); do
        [[ ! -f "$STELLA_ROOT/allow-deploy" ]] || break
        sleep 0.05
      done
      [[ -f "$STELLA_ROOT/allow-deploy" ]] || exit 1
    fi
    if [[ "${RELEASE:-}" == "${FAKE_FAIL_RELEASE:-disabled}" && ! -f "$FAKE_ONCE" ]]; then touch "$FAKE_ONCE"; exit 1; fi
    exit 0 ;;
  *' exec -T web node '*)
    cat >/dev/null
    if [[ "${RELEASE:-}" == "${FAKE_STALE_RELEASE:-disabled}" ]]; then exit 1; fi
    exit 0 ;;
  *' ps -q '*) echo test-container; exit 0 ;;
esac
exit 0
FAKE
cat > "$suite/bin/df" <<'FAKE'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\ntest 1000 100 900 10%% /\n'
FAKE
cat > "$suite/bin/rsync" <<'FAKE'
#!/usr/bin/env bash
if flock -n "$STELLA_ROOT/staging/deploy.lock" -c true; then
  echo 'Staging lock was released before media copy' >&2
  exit 1
fi
exit 0
FAKE
chmod +x "$suite/bin/"*
export PATH="$suite/bin:$PATH"
sha_a=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
sha_b=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
sha_c=cccccccccccccccccccccccccccccccccccccccc
new_case() {
  export STELLA_ROOT="$suite/$1"
  mkdir -p "$STELLA_ROOT/staging/env" "$STELLA_ROOT/staging/releases"
  export FAKE_TRACE="$STELLA_ROOT/trace" FAKE_ONCE="$STELLA_ROOT/once"
  : > "$FAKE_TRACE"
  unset RELEASE PROXY_CONFIG_DIR FAKE_FAIL_RELEASE FAKE_MIGRATE_FAIL FAKE_SCRUB_FAIL FAKE_STALE_RELEASE
  cat > "$STELLA_ROOT/staging/compose.env" <<CONF
COMPOSE_PROJECT_NAME=stella-staging
DATA_DIR=$STELLA_ROOT/staging
ENV_DIR=$STELLA_ROOT/staging/env
POSTGRES_DB=stella_staging
IMAGE_PREFIX=ghcr.io/test
RELEASE=$sha_b
CONF
  chmod 600 "$STELLA_ROOT/staging/compose.env"
  printf '%s\n' "$sha_a" > "$STELLA_ROOT/staging/releases/current"
  printf '%s\n' "$sha_b" > "$STELLA_ROOT/staging/releases/previous"
  mkdir -p "$STELLA_ROOT/staging/releases/$sha_a/proxy" "$STELLA_ROOT/staging/releases/$sha_b/proxy"
}
new_case failed-health
export FAKE_FAIL_RELEASE=$sha_c
if bash "$repo/infra/deploy.sh" staging "$sha_c" > "$STELLA_ROOT/result" 2>&1; then echo 'Failure was accepted'; exit 1; fi
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$sha_a" ]]
grep -q "$sha_a|.*up -d --wait --wait-timeout 180 api" "$FAKE_TRACE"
[[ -f "$STELLA_ROOT/staging/backups/last-success" ]]
echo 'PASS: failed health restores previous images without advancing release.'
new_case stale-website
export FAKE_STALE_RELEASE=$sha_c
if bash "$repo/infra/deploy.sh" staging "$sha_c" > "$STELLA_ROOT/result" 2>&1; then echo 'Stale website was accepted'; exit 1; fi
grep -Fq 'differs from the API' "$STELLA_ROOT/result"
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$sha_a" ]]
grep -q "$sha_a|.*up -d --wait --wait-timeout 180 api" "$FAKE_TRACE"
echo 'PASS: a website that disagrees with the API fails the gate and restores the previous release.'
new_case success
bash "$repo/infra/deploy.sh" staging "$sha_c" > "$STELLA_ROOT/result" 2>&1
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$sha_c" ]]
[[ $(cat "$STELLA_ROOT/staging/releases/previous") == "$sha_a" ]]
[[ -f "$STELLA_ROOT/staging/releases/$sha_c/proxy/Caddyfile" && -f "$STELLA_ROOT/staging/releases/$sha_c/proxy/caddy/common.caddy" ]]
bash "$repo/infra/deploy.sh" staging --rollback >> "$STELLA_ROOT/result" 2>&1
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$sha_a" ]]
echo 'PASS: successful deploy and explicit rollback record exact releases.'
new_case staging-acceptance
mkdir -p "$STELLA_ROOT/production/env" "$STELLA_ROOT/production/releases"
cat > "$STELLA_ROOT/production/compose.env" <<CONF
COMPOSE_PROJECT_NAME=stella-production
DATA_DIR=$STELLA_ROOT/production
ENV_DIR=$STELLA_ROOT/production/env
POSTGRES_DB=stella_prod
IMAGE_PREFIX=ghcr.io/test
WEB_HOST=www.stella-sharm.invalid-but-real
RELEASE=$sha_a
CONF
chmod 600 "$STELLA_ROOT/production/compose.env"
if bash "$repo/infra/deploy.sh" production "$sha_c" > "$STELLA_ROOT/result" 2>&1; then echo 'Unaccepted commit reached production'; exit 1; fi
grep -Fq 'no staging acceptance' "$STELLA_ROOT/result"
[[ ! -s "$FAKE_TRACE" ]]
if bash "$repo/infra/accept-staging.sh" "$sha_c" > "$STELLA_ROOT/result" 2>&1; then echo 'Accepted a commit staging is not running'; exit 1; fi
[[ ! -e "$STELLA_ROOT/staging/releases/accepted/$sha_c" ]]
bash "$repo/infra/accept-staging.sh" "$sha_a" > "$STELLA_ROOT/result" 2>&1
grep -Fq 'accepted_by=' "$STELLA_ROOT/staging/releases/accepted/$sha_a"
bash "$repo/infra/deploy.sh" production "$sha_a" > "$STELLA_ROOT/result" 2>&1 || true
if grep -Fq 'no staging acceptance' "$STELLA_ROOT/result"; then echo 'Accepted commit was refused'; exit 1; fi
grep -q "$sha_a|.*up -d --wait postgres" "$FAKE_TRACE"
echo 'PASS: production deploys only commits accepted while running in staging.'
new_case failed-migration
export FAKE_MIGRATE_FAIL=1
if bash "$repo/infra/deploy.sh" staging "$sha_c" > "$STELLA_ROOT/result" 2>&1; then exit 1; fi
if grep -q 'up -d --wait --wait-timeout 180 api' "$FAKE_TRACE"; then exit 1; fi
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$sha_a" ]]
echo 'PASS: failed migration never starts the new API.'
new_case cross-environment
sed -i 's/POSTGRES_DB=stella_staging/POSTGRES_DB=stella_prod/' "$STELLA_ROOT/staging/compose.env"
echo synthetic > "$STELLA_ROOT/source.dump"
if bash "$repo/infra/backup/restore-to-staging.sh" "$STELLA_ROOT/source.dump" > "$STELLA_ROOT/result" 2>&1; then exit 1; fi
[[ ! -s "$FAKE_TRACE" ]]
echo 'PASS: staging restore refuses production configuration before any Docker action.'
new_case failed-scrub
echo synthetic > "$STELLA_ROOT/source.dump"
export FAKE_SCRUB_FAIL=1
if bash "$repo/infra/backup/restore-to-staging.sh" "$STELLA_ROOT/source.dump" > "$STELLA_ROOT/result" 2>&1; then exit 1; fi
grep -q 'stop caddy worker api web admin' "$FAKE_TRACE"
if grep -q 'up.*api' "$FAKE_TRACE"; then exit 1; fi
echo 'PASS: failed scrub leaves staging offline.'
new_case successful-restore
echo synthetic > "$STELLA_ROOT/source.dump"
bash "$repo/infra/backup/restore-to-staging.sh" "$STELLA_ROOT/source.dump" > "$STELLA_ROOT/result" 2>&1
grep -q 'dropdb.*stella_staging' "$FAKE_TRACE"
if grep -q 'up.*api' "$FAKE_TRACE"; then exit 1; fi
echo 'PASS: successful scrub also leaves staging offline for explicit acceptance.'
new_case corrupt-release-record
printf 'invalid-release\n' > "$STELLA_ROOT/staging/releases/current"
if bash "$repo/infra/deploy.sh" staging "$sha_c" > "$STELLA_ROOT/result" 2>&1; then exit 1; fi
[[ ! -s "$FAKE_TRACE" ]]
echo 'PASS: corrupt release metadata is refused before any deployment action.'
new_case refresh-lock
mkdir -p "$STELLA_ROOT/production/env" "$STELLA_ROOT/production/backups" "$STELLA_ROOT/production/media"
cat > "$STELLA_ROOT/production/compose.env" <<CONF
COMPOSE_PROJECT_NAME=stella-production
DATA_DIR=$STELLA_ROOT/production
ENV_DIR=$STELLA_ROOT/production/env
POSTGRES_DB=stella_prod
IMAGE_PREFIX=ghcr.io/test
RELEASE=$sha_b
CONF
chmod 600 "$STELLA_ROOT/production/compose.env"
touch "$STELLA_ROOT/production/backups/last-success"
echo synthetic > "$STELLA_ROOT/production/backups/20261112T023000Z.dump"
bash "$repo/infra/backup/refresh-staging.sh" > "$STELLA_ROOT/result" 2>&1
echo 'PASS: nightly refresh retains the staging deploy lock through scrub and public-media copy.'

new_case overlapping-deploys
export STELLA_GIT_REPO="$STELLA_ROOT/repo"
mkdir -p "$STELLA_GIT_REPO"
git -C "$STELLA_GIT_REPO" init -q
cp -r "$repo/infra" "$STELLA_GIT_REPO/infra"
printf 'first\n' > "$STELLA_GIT_REPO/infra/release-test"
git -C "$STELLA_GIT_REPO" add infra
git -C "$STELLA_GIT_REPO" -c user.name=QA -c user.email=qa@example.test commit -qm first
first=$(git -C "$STELLA_GIT_REPO" rev-parse HEAD)
printf 'second\n' > "$STELLA_GIT_REPO/infra/release-test"
git -C "$STELLA_GIT_REPO" -c user.name=QA -c user.email=qa@example.test commit -qam second
second=$(git -C "$STELLA_GIT_REPO" rev-parse HEAD)
export FAKE_BLOCK_RELEASE="$first"
bash "$repo/infra/deploy-release.sh" staging "$first" > "$STELLA_ROOT/first-result" 2>&1 &
running=$!
for _ in $(seq 1 100); do
  [[ ! -f "$STELLA_ROOT/deploy-started" ]] || break
  sleep 0.05
done
[[ -f "$STELLA_ROOT/deploy-started" ]]
if bash "$repo/infra/deploy-release.sh" staging "$second" > "$STELLA_ROOT/second-result" 2>&1; then exit 1; fi
grep -Fq 'already running' "$STELLA_ROOT/second-result"
[[ $(cat "$STELLA_ROOT/release-checkouts/$first/infra/release-test") == first ]]
[[ $(cat "$STELLA_ROOT/release-checkouts/$second/infra/release-test") == second ]]
[[ $(git -C "$STELLA_GIT_REPO" rev-parse HEAD) == "$second" ]]
touch "$STELLA_ROOT/allow-deploy"
wait "$running"
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$first" ]]
echo 'PASS: concurrent revisions keep isolated release files and the environment lock prevents overlap.'

new_case alert
export STELLA_ALERT_WEBHOOK_FILE="$STELLA_ROOT/webhook-url"
printf 'https://alerts.example.test/hooks/synthetic-token\n' > "$STELLA_ALERT_WEBHOOK_FILE"
cat > "$suite/bin/logger" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STELLA_ROOT/alert-journal"
FAKE
cat > "$suite/bin/curl" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$STELLA_ROOT/alert-argv"
cat > "$STELLA_ROOT/alert-config"
FAKE
chmod +x "$suite/bin/logger" "$suite/bin/curl"
bash "$repo/infra/monitoring/alert.sh" stella-monitor@staging.service
grep -Fq 'stella_unit_failed' "$STELLA_ROOT/alert-argv"
grep -Fq 'stella-monitor@staging.service' "$STELLA_ROOT/alert-journal"
grep -Fq 'https://alerts.example.test/hooks/synthetic-token' "$STELLA_ROOT/alert-config"
if grep -Fq 'synthetic-token' "$STELLA_ROOT/alert-argv" "$STELLA_ROOT/alert-journal"; then exit 1; fi
echo 'PASS: the alert sends only the unit event and keeps the webhook credential out of argv and logs.'
echo '12 operational safety scenarios passed (simulated Docker and alert transport).'
