#!/usr/bin/env bash
# AUDIT-T03 — Drizzle schema/snapshot drift probe (BUG-01).
# Copies packages/db to a temp dir and runs `drizzle-kit generate` there, so the
# repository is never written. A non-empty generated migration means the
# committed snapshots (meta/*_snapshot.json) lag the schema and the next real
# `pnpm db:generate` would re-emit DDL that hand-written migrations already
# applied (0010 trips.story, 0011 indexes, 0012 privacy_erasures).
# Expected after a fix: "No schema changes, nothing to migrate".
set -euo pipefail
repo=$(cd "$(dirname "$0")/../../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r "$repo/packages/db/drizzle" "$repo/packages/db/src" \
  "$repo/packages/db/drizzle.config.ts" "$repo/packages/db/package.json" "$tmp/"
ln -s "$repo/packages/db/node_modules" "$tmp/node_modules"
cd "$tmp"
"$repo/node_modules/.bin/drizzle-kit" generate --name drift_probe | tail -3
if ls drizzle/*drift_probe.sql >/dev/null 2>&1; then
  echo "DRIFT DETECTED:"; cat drizzle/*drift_probe.sql; exit 1
fi
echo "No drift"
