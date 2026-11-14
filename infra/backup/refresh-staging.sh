#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname -- "$0")/../lib.sh"
load_environment production
[[ -f "$DATA_DIR/backups/last-success" && $(find "$DATA_DIR/backups/last-success" -mmin -1560 -print) ]] || { echo 'Fresh production backup required before staging refresh' >&2; exit 1; }
latest=$(find "$DATA_DIR/backups" -maxdepth 1 -type f -name '*.dump' -printf '%f\n' | sort | tail -n 1)
[[ "$latest" =~ ^[0-9]{8}T[0-9]{6}Z\.dump$ ]] || { echo 'No validated local dump available' >&2; exit 1; }
source_dump="$DATA_DIR/backups/$latest"
[[ $(find "$source_dump" -mmin -1560 -print) ]] || { echo 'Selected dump is stale' >&2; exit 1; }
public_media="$DATA_DIR/media"
# The target must load ITS release/config, never the inherited production SHA.
unset RELEASE PROXY_CONFIG_DIR
load_environment staging
lock_environment
bash "$STELLA_REPO/infra/backup/restore-to-staging.sh" "$source_dump"
# Only already-public processed outputs. No originals, env, keys or auth data.
rsync -a --ignore-existing -- "$public_media/" "$DATA_DIR/media/"
echo 'Staging refreshed from a fresh backup and public media. It remains STOPPED until its own accounts/media are accepted.'
