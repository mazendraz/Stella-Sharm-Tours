#!/usr/bin/env bash
set -euo pipefail
tool=${1:?Supply ffmpeg or ffprobe}
shift
[[ "$tool" == ffmpeg || "$tool" == ffprobe ]] || exit 1
[[ -n ${GITHUB_WORKSPACE:-} && "$GITHUB_WORKSPACE" == /* ]] || exit 1
# Use the same reviewed Linux codec build as production, with no network access.
# One long-lived, isolated container serves every call: starting a fresh
# container per ffmpeg/ffprobe call made the catalog seed take ~10 minutes.
name=stella-ci-media-tools
if [[ $(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null) != true ]]; then
  # Concurrent first calls may race; whichever loses reuses the winner.
  docker run -d --name "$name" --network none --read-only --cap-drop ALL \
    --user "$(id -u):$(id -g)" \
    --security-opt no-new-privileges --tmpfs /tmp:size=256m \
    -v "$GITHUB_WORKSPACE:$GITHUB_WORKSPACE" -w "$GITHUB_WORKSPACE" \
    --entrypoint sleep stella-ci-media infinity >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    [[ $(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null) == true ]] && break
    sleep 0.2
  done
fi
exec docker exec -w "$GITHUB_WORKSPACE" "$name" "$tool" "$@"
