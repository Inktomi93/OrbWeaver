#!/usr/bin/env bash
# The dev overlay's entrypoint (docker/compose.dev.yaml): a stock node image + your bind-mounted checkout →
# pnpm (pinned by package.json's packageManager, installed under $HOME so no root is needed), the workspace
# install into the checkout (a fresh clone has no node_modules), then the command (`pnpm stack up-fg`).
set -euo pipefail

cd /app
export HOME="${HOME:-/app/.cache/docker-dev-home}"
prefix="${HOME}/.npm-global"
export PATH="${prefix}/bin:${PATH}"
export npm_config_prefix="${prefix}"

if [ ! -w /app ]; then
  echo "dev-entrypoint: /app (your checkout) is not writable by uid $(id -u) — set PUID/PGID to your user (docker/compose.dev.yaml)" >&2
  exit 1
fi
mkdir -p "${prefix}"

want="$(node -p "require('./package.json').packageManager.replace(/^pnpm@/, '').replace(/\+.*$/, '')")"
have="$(pnpm --version 2>/dev/null || true)"
if [ "${have}" != "${want}" ]; then
  echo "dev-entrypoint: installing pnpm@${want} into ${prefix}" >&2
  npm install -g --silent "pnpm@${want}"
fi
# The store lives beside pnpm inside the checkout's .cache (gitignored) so a container recreate reuses it.
pnpm config set store-dir "${HOME}/.local/share/pnpm/store" >/dev/null
echo "dev-entrypoint: pnpm install --frozen-lockfile (installs node_modules into your checkout; fast when nothing changed)" >&2
pnpm install --frozen-lockfile

exec "$@"
