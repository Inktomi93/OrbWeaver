#!/bin/sh
# ── assemble the runtime file set (the ONE home for what the image ships) ─────────────────────────────
#
#   sh docker/assemble-runtime.sh <workspace> <pnpm-deploy-output> <out>
#
# Runs in the Dockerfile's build stage after `pnpm build` + `pnpm --filter @orb/server deploy --legacy --prod
# --config.node-linker=hoisted <deploy>`. Produces <out> = exactly what /app is in the runtime image:
#
#   <out>/node_modules            the deploy output's pruned, hoisted production node_modules
#   <out>/packages/<name>/        the SOURCE of every @orb workspace package in the server's prod graph
#                                 (package.json + everything the package ships, minus its node_modules)
#   <out>/node_modules/@orb/<name> -> ../../packages/<name>   (symlink; see WHY)
#   <out>/packages/client/dist    the built client bundle (the SPA registrar serves it; CLIENT_DIST_DIR default)
#   <out>/package.json            the root manifest
#
# WHY the symlink dance instead of the deploy output as-is: node 26 refuses to type-strip a real .ts file
# that lives under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). The dev workspace passes only
# because workspace packages are symlinks whose realpath is OUTSIDE node_modules — this reproduces that
# shape. The package SET is discovered from the deploy output (whatever pnpm materialized under
# node_modules/@orb IS the server's prod graph), so a new workspace package the server declares (D160
# default-content packages) is picked up with no edit here or in the Dockerfile.
set -eu

src="${1:?workspace root}"
deploy="${2:?pnpm deploy output}"
out="${3:?output dir}"

[ -d "$deploy/node_modules" ] || { echo "assemble-runtime: $deploy/node_modules is missing — did pnpm deploy run?" >&2; exit 1; }
[ -d "$src/packages/client/dist" ] || { echo "assemble-runtime: packages/client/dist is missing — did pnpm build run?" >&2; exit 1; }

mkdir -p "$out/packages"
cp "$src/package.json" "$out/package.json"
mv "$deploy/node_modules" "$out/node_modules"
mkdir -p "$out/node_modules/@orb"

# Ship one workspace package as source behind its symlink. Refuses a name that has no packages/<name>
# (the @orb/<name> ↔ packages/<name> convention is what makes discovery possible).
ship_package() {
  name="$1"
  if [ ! -f "$src/packages/$name/package.json" ]; then
    echo "assemble-runtime: @orb/$name is in the server's prod graph but packages/$name/package.json does not exist" >&2
    exit 1
  fi
  rm -rf "$out/node_modules/@orb/$name" "$out/packages/$name"
  cp -R "$src/packages/$name" "$out/packages/$name"
  rm -rf "$out/packages/$name/node_modules"
  ln -s "../../packages/$name" "$out/node_modules/@orb/$name"
  echo "assemble-runtime: shipped @orb/$name as source"
}

# The server itself is the deploy ROOT (not under node_modules/@orb); it ships the same way, and its
# self-symlink serves `@orb/server/...` package-name imports.
ship_package server
for dir in "$out"/node_modules/@orb/*; do
  name="$(basename "$dir")"
  [ "$name" = server ] && continue
  ship_package "$name"
done

# The client ships its BUILD only.
mkdir -p "$out/packages/client"
cp -R "$src/packages/client/dist" "$out/packages/client/dist"

# ── the build identity stamp (owner ask 2026-09-18) ──────────────────────────────────────────────────
# /app/version.json is how a CONTAINER answers "which commit am I?" — an image ships no .git, so nothing
# else could. `foundation/version` PREFERS this file over .git at runtime, which also covers the build
# stage's own throwaway `git init` (HEAD names a branch that was never committed → `unknown`).
#
# The derivation is NOT forked here: this invokes the server's own reader (`buildVersionStamp`), the same
# code that reads the stamp back at boot, so the stamp can never disagree with the reader's rules. The
# workspace's ref files are present in this stage because .dockerignore un-ignores exactly four plain ref
# files — and the Dockerfile moves them to `.git-refs` BEFORE its throwaway `git init`, so the stamp is read
# through a `gitdir:` redirect root (the linked-worktree shape the reader already understands) rather than
# from the empty repo git sees. Without the moved dir (an archive build) the stamp reads the source root.
# `builtAt` is passed IN rather than read inside the package: production source reads time from the
# injected clock (the `no-raw-clock` law), and a build script is the one place that legitimately knows the
# wall instant.
stamp_root="$src"
if [ -d "$src/.git-refs" ]; then
  stamp_root="$(mktemp -d)"
  cp "$src/package.json" "$stamp_root/package.json"
  printf 'gitdir: %s\n' "$src/.git-refs" > "$stamp_root/.git"
fi
ORB_STAMP_ROOT="$stamp_root" \
ORB_STAMP_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  pnpm --silent --dir "$src" run build:version-stamp \
    > "$out/version.json"
echo "assemble-runtime: stamped version.json = $(cat "$out/version.json")"

# ── prune what this image can never execute (measured 2026-09-18: ~620 MB of a 1.2 GB node_modules) ──
# onnxruntime-node ships every platform's binaries plus the CUDA/TensorRT providers; the slim image runs the
# CPU provider on ONE platform (the local-light embedding backend). onnxruntime-web is the browser build
# @huggingface/transformers carries for bundlers — never loaded under node. Both removals are PROVEN below:
# the transformers import (which loads the onnxruntime-node binding at import time) must still resolve.
arch="$(node -p 'process.arch')"
ort="$out/node_modules/onnxruntime-node/bin"
if [ -d "$ort" ]; then
  for platform in "$ort"/napi-v*/*; do
    case "$(basename "$platform")" in linux) ;; *) rm -rf "$platform" ;; esac
  done
  for archdir in "$ort"/napi-v*/linux/*; do
    [ "$(basename "$archdir")" = "$arch" ] || rm -rf "$archdir"
  done
  find "$ort" -name 'libonnxruntime_providers_cuda*' -delete
  find "$ort" -name 'libonnxruntime_providers_tensorrt*' -delete
fi
rm -rf "$out/node_modules/onnxruntime-web"
(cd "$out" && node -e 'import("@huggingface/transformers").then(() => console.log("assemble-runtime: @huggingface/transformers imports after the prune"), (e) => { console.error("assemble-runtime: the prune broke @huggingface/transformers:", e); process.exit(1); })')

# Receipts the build log can be read by.
echo "assemble-runtime: packages = $(find "$out/packages" -mindepth 1 -maxdepth 1 -exec basename {} \; | sort | tr '\n' ' ')"
echo "assemble-runtime: node_modules entries = $(find "$out/node_modules" -mindepth 1 -maxdepth 1 | wc -l)"
