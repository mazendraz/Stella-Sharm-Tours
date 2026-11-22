#!/bin/sh
set -eu
umask 077
test_root=$(mktemp -d /tmp/stella-restic.XXXXXX)
export RESTIC_REPOSITORY="$test_root/repository"
export RESTIC_PASSWORD
RESTIC_PASSWORD=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
mkdir "$test_root/source"
printf 'Synthetic Stella encrypted restore verification\n' > "$test_root/source/fixture.txt"
mkdir "$test_root/source/media"
cp /fixtures/poster.jpg "$test_root/source/media/poster.jpg"
cp /fixtures/clip.mp4 "$test_root/source/media/clip.mp4"
restic init --quiet
restic backup --quiet --tag stella-local-verification "$test_root/source"
restic check --read-data --quiet
snapshot=$(restic snapshots --latest 1 --json | grep -oE '"id"[[:space:]]*:[[:space:]]*"[a-f0-9]+"' | sed -E 's/.*"([a-f0-9]+)"$/\1/')
[ -n "$snapshot" ]
restic restore "$snapshot" --target "$test_root/restored" --verify --quiet
cmp "$test_root/source/fixture.txt" "$test_root/restored$test_root/source/fixture.txt"
cmp "$test_root/source/media/poster.jpg" "$test_root/restored$test_root/source/media/poster.jpg"
cmp "$test_root/source/media/clip.mp4" "$test_root/restored$test_root/source/media/clip.mp4"
restic forget --tag stella-local-verification --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune --quiet
echo 'PASS: encrypted local restic backup, byte-identical poster and clip restore, and retention.'
