#!/usr/bin/env bash
# One-off catalog import for a fresh environment.
# Usage: infra/seed-catalog.sh [production|staging]   (default: production)
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname -- "$0")/lib.sh"
load_environment "${1:-production}"
lock_environment
[[ "${RELEASE:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'No deployed release recorded; deploy first' >&2; exit 1; }

# The seed container may use up to 2 GiB; leave headroom for the running stack.
required_kb=$((2300 * 1024))
available_kb=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
if (( available_kb < required_kb )); then
  echo "Not enough memory: $((available_kb / 1024)) MB available, 2300 MB required" >&2
  exit 1
fi

output_dir="$DATA_DIR/seed-output"
link_file="$output_dir/admin-setup-link"
install -d -m 700 -o 1000 -g 1000 -- "$output_dir"
rm -f -- "$link_file"

echo "== Seeding catalog with release $RELEASE"
compose run --rm --no-deps seed

if [[ -s "$link_file" ]]; then
  echo
  echo 'Owner setup link (single use, expires in 30 minutes):'
  cat -- "$link_file"
  echo
  rm -f -- "$link_file"
else
  echo 'No setup link generated (owner account already set up).'
fi
