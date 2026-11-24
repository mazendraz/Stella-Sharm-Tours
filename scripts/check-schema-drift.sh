#!/usr/bin/env bash
# Fails when packages/db/src/schema.ts and the latest Drizzle snapshot disagree,
# i.e. when the next `pnpm db:generate` would emit a migration. Hand-written
# migrations must ship with a matching meta/NNNN_snapshot.json (audit
# 2026-11-24 BUG-01). Works on a temporary copy; the repository is not written.
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cp -r "$repo/packages/db/drizzle" "$repo/packages/db/src" \
  "$repo/packages/db/drizzle.config.ts" "$repo/packages/db/package.json" "$work/"
ln -s "$repo/packages/db/node_modules" "$work/node_modules"
cd "$work"
"$repo/node_modules/.bin/drizzle-kit" check >/dev/null
"$repo/node_modules/.bin/drizzle-kit" generate --name schema_drift_check >/dev/null
if compgen -G 'drizzle/*schema_drift_check.sql' >/dev/null; then
  echo 'Schema drift: the Drizzle snapshot does not match schema.ts. Pending DDL:' >&2
  cat drizzle/*schema_drift_check.sql >&2
  exit 1
fi
echo 'Drizzle schema and snapshots agree.'
