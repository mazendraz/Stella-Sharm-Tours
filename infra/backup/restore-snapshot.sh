#!/usr/bin/env bash
set -euo pipefail
umask 077
# Restore restic into a new empty private directory, NEVER over production paths.
snapshot=${1:?Usage: restore-snapshot.sh snapshot-id /absolute/new/private/directory}
target=${2:?Supply an empty restore directory}
[[ "$snapshot" =~ ^[a-f0-9]{8,64}$ && "$target" == /* && ! -e "$target" ]] || { echo 'Explicit snapshot ID and new absolute directory required' >&2; exit 1; }
mkdir -m 700 -- "$target"
restic check
restic restore "$snapshot" --target "$target" --verify
echo 'Snapshot restored privately. Use restore-to-staging.sh before any production recovery.'
