#!/usr/bin/env bash
exec bash "$(dirname -- "$0")/ci-media-tool.sh" ffprobe "$@"
