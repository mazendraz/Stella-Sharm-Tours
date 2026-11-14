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
    if [[ "${RELEASE:-}" == "${FAKE_FAIL_RELEASE:-disabled}" && ! -f "$FAKE_ONCE" ]]; then touch "$FAKE_ONCE"; exit 1; fi
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
  unset RELEASE PROXY_CONFIG_DIR FAKE_FAIL_RELEASE FAKE_MIGRATE_FAIL FAKE_SCRUB_FAIL
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
new_case success
bash "$repo/infra/deploy.sh" staging "$sha_c" > "$STELLA_ROOT/result" 2>&1
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$sha_c" ]]
[[ $(cat "$STELLA_ROOT/staging/releases/previous") == "$sha_a" ]]
[[ -f "$STELLA_ROOT/staging/releases/$sha_c/proxy/Caddyfile" && -f "$STELLA_ROOT/staging/releases/$sha_c/proxy/caddy/common.caddy" ]]
bash "$repo/infra/deploy.sh" staging --rollback >> "$STELLA_ROOT/result" 2>&1
[[ $(cat "$STELLA_ROOT/staging/releases/current") == "$sha_a" ]]
echo 'PASS: successful deploy and explicit rollback record exact releases.'
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
echo '8 operational safety scenarios passed (simulated Docker; no real deployment).'
