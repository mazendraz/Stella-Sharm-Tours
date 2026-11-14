#!/usr/bin/env bash
set -euo pipefail
tool=${1:?Supply ffmpeg or ffprobe}
shift
[[ "$tool" == ffmpeg || "$tool" == ffprobe ]] || exit 1
[[ -n ${GITHUB_WORKSPACE:-} && "$GITHUB_WORKSPACE" == /* ]] || exit 1
# Use the same reviewed Linux codec build as production, with no network access.
exec docker run --rm --network none --read-only --cap-drop ALL \
  --user "$(id -u):$(id -g)" \
  --security-opt no-new-privileges --tmpfs /tmp:size=256m \
  -v "$GITHUB_WORKSPACE:$GITHUB_WORKSPACE" -w "$GITHUB_WORKSPACE" \
  stella-ci-media "$tool" "$@"
