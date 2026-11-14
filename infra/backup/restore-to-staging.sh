#!/usr/bin/env bash
set -euo pipefail
umask 077
# shellcheck source=infra/lib.sh
source "$(dirname -- "$0")/../lib.sh"
load_environment staging
source_dump=${1:?Usage: restore-to-staging.sh /absolute/path/to/backup.dump}
[[ "$source_dump" == /* && -f "$source_dump" && ! -L "$source_dump" ]] || { echo 'Use an absolute regular dump path' >&2; exit 1; }
lock_environment
export RELEASE
RELEASE=$(read_release "$STATE_DIR/current")
compose config --quiet
compose stop caddy worker api web admin
compose up -d --wait postgres
# This deliberately destroys ONLY stella_staging, never production. lib.sh enforces the name/project/path.
compose exec -T postgres dropdb -U stella_migrate --if-exists --force stella_staging
compose exec -T postgres createdb -U stella_migrate stella_staging
compose exec -T postgres pg_restore -U stella_migrate -d stella_staging --no-owner --no-acl --exit-on-error < "$source_dump"
compose exec -T postgres psql -U stella_migrate -d stella_staging -v ON_ERROR_STOP=1 < "$STELLA_REPO/infra/backup/scrub-staging.sql"
compose run --rm --no-deps migrate
compose exec -T postgres psql -U stella_migrate -d stella_staging -v ON_ERROR_STOP=1 -c 'REVOKE ALL ON DATABASE stella_staging FROM PUBLIC; GRANT CONNECT ON DATABASE stella_staging TO stella_api,stella_worker;'
# Fail closed: on any failure no app or public gateway is restarted.
remaining=$(compose exec -T postgres psql -U stella_migrate -d stella_staging -tAc 'SELECT (SELECT count(*) FROM booking_requests)+(SELECT count(*) FROM admin_users)+(SELECT count(*) FROM sessions)+(SELECT count(*) FROM outbox)')
[[ "$remaining" == 0 ]] || { echo 'PII scrub verification failed; staging remains stopped' >&2; exit 1; }
echo 'Staging database restored and scrubbed. Services remain STOPPED.'
echo 'Import approved public media, provision a separate staging owner, then deploy staging.'
