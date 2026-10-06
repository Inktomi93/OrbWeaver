#!/usr/bin/env bash
# `pnpm sync`: bring local main level with GitHub, then push it. Merges made on GitHub (Dependabot PRs on
# main, the release-please PR on `release`) land on origin, and main is pushed from this checkout, so they
# are merged in here first or the push is refused.
# `pnpm release`: sync, then push main to `release`, which opens or updates the release-please PR.
# Extra arguments go to `git push`, e.g. `pnpm release --no-verify`.
# `--check` (the pre-push hook) only reports: it fails when GitHub has merges local main lacks.
set -euo pipefail

if [ "${1:-}" = "--check" ]; then
  # Only main is pushed from a checkout; other branches are not this hook's business.
  [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || exit 0
  git fetch --quiet origin || exit 0
  for ref in origin/main origin/release; do
    git rev-parse --quiet --verify "$ref" >/dev/null || continue
    git merge-base --is-ancestor "$ref" HEAD && continue
    echo "GitHub has merges on ${ref#origin/} that local main lacks (Dependabot or a release). Run: pnpm sync"
    exit 1
  done
  exit 0
fi

release=0
if [ "${1:-}" = "--release" ]; then
  release=1
  shift
fi

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "sync: check out main first"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "sync: commit tracked changes first"; exit 1; }

git fetch --quiet origin
for ref in origin/main origin/release; do
  git rev-parse --quiet --verify "$ref" >/dev/null || continue
  git merge-base --is-ancestor "$ref" HEAD && continue
  echo "sync: merging $ref"
  if ! git merge --no-edit "$ref"; then
    echo "sync: merge conflict. If only pnpm-lock.yaml conflicts: pnpm install, git add pnpm-lock.yaml,"
    echo "      git commit --no-edit, then run this again."
    exit 1
  fi
done

git push "$@" origin main
if [ "$release" = 1 ]; then
  git push "$@" origin main:release
  echo "release: pushed. Merge the release PR on GitHub to publish; it updates within a minute or two:"
  echo "         https://github.com/Inktomi93/orbweaver/pulls?q=is%3Aopen+label%3A%22autorelease%3A+pending%22"
fi
