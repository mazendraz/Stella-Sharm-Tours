#!/usr/bin/env bash
set -euo pipefail
umask 077
target=${1:?Usage: deploy-release.sh production|staging SHA}
sha=${2:?Supply a commit SHA}
root=${STELLA_ROOT:-/srv/stella}
repository=${STELLA_GIT_REPO:-$root/repo}
[[ "$target" == production || "$target" == staging ]] || exit 2
[[ "$sha" =~ ^[a-f0-9]{40}$ && "$root" == /* && -d "$root" ]] || exit 2
store="$root/release-checkouts"
mkdir -m 700 -p -- "$store"
checkout="$store/$sha"

# Both environment jobs can share Git objects. None changes its working tree.
exec 7>"$store/.prepare.lock"
flock 7
if [[ ! -d "$checkout" ]]; then
  if ! git -C "$repository" cat-file -e "$sha^{commit}" 2>/dev/null; then
    git -C "$repository" fetch origin
  fi
  [[ $(git -C "$repository" rev-parse --verify "$sha^{commit}") == "$sha" ]]
  temporary=$(mktemp -d "$store/.release.XXXXXX")
  cleanup() {
    chmod -R u+w -- "$temporary"
    rm -rf -- "$temporary"
  }
  trap cleanup EXIT
  git -C "$repository" archive "$sha" infra | tar -xf - -C "$temporary"
  test -f "$temporary/infra/deploy.sh"
  chmod -R a-w -- "$temporary"
  mv -T -- "$temporary" "$checkout"
  trap - EXIT
fi
[[ ! -L "$checkout" && -f "$checkout/infra/deploy.sh" ]]
flock -u 7
exec 7>&-
exec bash "$checkout/infra/deploy.sh" "$target" "$sha"
