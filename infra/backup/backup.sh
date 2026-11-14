#!/usr/bin/env bash
set -euo pipefail
umask 077
# shellcheck source=infra/lib.sh
source "$(dirname -- "$0")/../lib.sh"
load_environment "${1:?Choose production or staging}"
lock_environment
exec 8>"$DATA_DIR/backup.lock"
flock -n 8 || { echo 'Backup already running' >&2; exit 1; }
mkdir -p "$DATA_DIR/backups"
chmod 700 "$DATA_DIR/backups"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump="$DATA_DIR/backups/$stamp.dump"
if ! compose exec -T postgres pg_dump -U stella_migrate -d "$POSTGRES_DB" -Fc --no-owner --no-acl > "$dump.partial"; then
  rm -f -- "$dump.partial"
  exit 1
fi
compose exec -T postgres pg_restore --list < "$dump.partial" >/dev/null
mv -- "$dump.partial" "$dump"
if [[ -f "$ENV_DIR/backup.env" ]]; then
  [[ $(stat -c %a "$ENV_DIR/backup.env") == 600 && -O "$ENV_DIR/backup.env" ]] || exit 1
  set -a
  # shellcheck source=/dev/null
  source "$ENV_DIR/backup.env"
  set +a
fi
if [[ -n "${RESTIC_REPOSITORY:-}" ]]; then
  # The operator initializes the encrypted repository explicitly once.
  restic backup --tag "stella-$ENVIRONMENT" "$dump" "$DATA_DIR/media" "$DATA_DIR/originals"
  restic forget --tag "stella-$ENVIRONMENT" --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
  touch "$DATA_DIR/backups/last-offsite-success"
else
  echo 'WARNING: encrypted off-site backup is not configured; private local dump retained.' >&2
fi
# Keep local dumps 7 days only after a successful new dump/upload. Off-site retention is above.
find "$DATA_DIR/backups" -maxdepth 1 -type f -name '*.dump' -mtime +7 -delete
touch "$DATA_DIR/backups/last-success"
echo 'Database backup completed.'
