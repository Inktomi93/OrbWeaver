#!/bin/sh
# ── assemble the runtime file set (the ONE home for what the image ships) ─────────────────────────────
#
#   sh docker/assemble-runtime.sh deps <pnpm-deploy-output> <deps-out> <links>
#   sh docker/assemble-runtime.sh app  <workspace> <links> <app-out>
#
# Two phases, because the Dockerfile builds the two halves of the image from different inputs. `deps` runs in the
# `prod-deps` stage, which sees only the workspace manifests and the lockfile, after
# `pnpm --filter @orb/server deploy --legacy --prod --config.shamefully-hoist=true <deploy>`. `app` runs in the
# `build` stage after `pnpm build`. A source edit therefore never re-runs the deploy, and the image's
# node_modules layer is reused byte for byte. Together they produce exactly what the runtime image holds:
#
#   <deps-out>/node_modules       the deploy output's pruned, hoisted production node_modules, minus @orb   → /app/node_modules
#   <links>/@orb/<name> -> /app/packages/<name>   (symlink; see WHY)                                        → /node_modules
#   <app-out>/packages/<name>/    the SOURCE of every @orb workspace package in the server's prod graph       → /app/packages
#                                 (package.json + everything the package ships, minus its node_modules)
#   <app-out>/packages/client/dist    the built client bundle (the SPA registrar serves it; CLIENT_DIST_DIR default)
#   <app-out>/package.json        the root manifest
#   <app-out>/version.json        the build identity stamp
#
# WHY the symlink dance instead of the deploy output as-is: node 26 refuses to type-strip a real .ts file
# that lives under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). The dev workspace passes only
# because workspace packages are symlinks whose realpath is OUTSIDE node_modules — this reproduces that
# shape. The package SET is discovered from the deploy output (whatever pnpm materialized under
# node_modules/@orb IS the server's prod graph) and handed from `deps` to `app` as the link set, so a new
# workspace package the server declares (D160 default-content packages) is picked up with no edit here or in
# the Dockerfile.
#
# WHY the links live at /node_modules/@orb and not /app/node_modules/@orb: the plugin broker may read
# /app/node_modules, and Node checks a read against the lexical path while the kernel follows a link before it
# applies `..`. A link at /app/node_modules/@orb/<name> sits one level deeper than /app/packages/<name>, so
# `/app/node_modules/@orb/server/../../data` would pass the check as /app/node_modules/data and open the data dir.
# At /node_modules/@orb/<name> the link and its target sit at the same depth. Node's resolver still finds them:
# its upward walk ends at /node_modules.
set -eu

# Where the Dockerfile copies the app half; every link points into it.
runtime_root=/app

usage() {
  echo "usage: assemble-runtime.sh deps <pnpm-deploy-output> <deps-out> <links>" >&2
  echo "       assemble-runtime.sh app <workspace> <links> <app-out>" >&2
  exit 2
}

# ── the plugin broker's read grants hold no link that points up ─────────────────────────────────────────
# The broker may read packages/ and node_modules/ (packages/server/src/infra/plugin-host/process-permission.ts). A
# link whose target sits higher than the link turns `<link>/../..` into a read outside the grants (see WHY at the
# top), so every node_modules link must stay inside node_modules at the same depth or deeper, and packages/ must
# hold no link at all.
depth() { printf '%s' "$1" | tr -cd / | wc -c; }

refuse_upward_node_modules_links() {
  node_modules="$1"
  upward="$(find "$node_modules" -type l | while read -r link; do
    target="$(readlink -m "$link")"
    case "$target" in
      "$node_modules/"*) [ "$(depth "$target")" -ge "$(depth "$link")" ] || echo "$link -> $target" ;;
      *) echo "$link -> $target" ;;
    esac
  done)"
  if [ -n "$upward" ]; then
    echo "assemble-runtime: node_modules holds links that point up or out, past the plugin broker's read grants:" >&2
    echo "$upward" | head -20 >&2
    exit 1
  fi
  echo "assemble-runtime: no link in node_modules/ points up past the plugin broker's read grants"
}

refuse_packages_links() {
  packages="$1"
  if [ -n "$(find "$packages" -type l -print -quit)" ]; then
    echo "assemble-runtime: packages/ holds a symlink; the plugin broker's read grant must not: $(find "$packages" -type l | head -5)" >&2
    exit 1
  fi
  echo "assemble-runtime: packages/ holds no link"
}

# ── deps: the production node_modules and the workspace-package link set ─────────────────────────────
assemble_deps() {
  deploy="$1"
  out="$2"
  links="$3"
  [ -d "$deploy/node_modules" ] || { echo "assemble-runtime: $deploy/node_modules is missing — did pnpm deploy run?" >&2; exit 1; }

  mkdir -p "$out" "$links/@orb"
  mv "$deploy/node_modules" "$out/node_modules"
  # The server is the deploy ROOT (not under node_modules/@orb); its link serves `@orb/server/...` package-name
  # imports like every other workspace package's.
  ln -s "$runtime_root/packages/server" "$links/@orb/server"
  for dir in "$out"/node_modules/@orb/*; do
    name="$(basename "$dir")"
    [ "$name" = server ] && continue
    ln -s "$runtime_root/packages/$name" "$links/@orb/$name"
  done
  rm -rf "$out/node_modules/@orb"

  # ── prune what this image can never execute (measured 2026-09-18: ~620 MB of a 1.2 GB node_modules) ──
  # onnxruntime-node ships every platform's CPU binaries (its CUDA download is denied in pnpm-workspace.yaml
  # allowBuilds); the slim image runs the CPU provider on ONE platform (the local-light embedding backend).
  # onnxruntime-web is the browser build
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
  fi
  # The hoisted entry is a symlink into the virtual store, so the payload goes with it.
  rm -rf "$out/node_modules/onnxruntime-web" "$out"/node_modules/.pnpm/onnxruntime-web@*
  (cd "$out" && node -e 'import("@huggingface/transformers").then(() => console.log("assemble-runtime: @huggingface/transformers imports after the prune"), (e) => { console.error("assemble-runtime: the prune broke @huggingface/transformers:", e); process.exit(1); })')

  refuse_upward_node_modules_links "$out/node_modules"
  echo "assemble-runtime: workspace packages = $(find "$links/@orb" -mindepth 1 -maxdepth 1 -exec basename {} \; | sort | tr '\n' ' ')"
  echo "assemble-runtime: node_modules entries = $(find "$out/node_modules" -mindepth 1 -maxdepth 1 | wc -l)"
}

# ── app: the workspace-package sources, the client bundle and the build identity ─────────────────────
assemble_app() {
  src="$1"
  links="$2"
  out="$3"
  [ -d "$src/packages/client/dist" ] || { echo "assemble-runtime: packages/client/dist is missing — did pnpm build run?" >&2; exit 1; }
  [ -d "$links/@orb" ] || { echo "assemble-runtime: $links/@orb is missing — did the deps phase run?" >&2; exit 1; }

  mkdir -p "$out/packages"
  cp "$src/package.json" "$out/package.json"

  # Ship every workspace package the deps phase linked, as source. Refuses a name that has no packages/<name>
  # (the @orb/<name> ↔ packages/<name> convention is what makes discovery possible).
  for link in "$links"/@orb/*; do
    name="$(basename "$link")"
    if [ ! -f "$src/packages/$name/package.json" ]; then
      echo "assemble-runtime: @orb/$name is in the server's prod graph but packages/$name/package.json does not exist" >&2
      exit 1
    fi
    cp -R "$src/packages/$name" "$out/packages/$name"
    rm -rf "$out/packages/$name/node_modules"
    echo "assemble-runtime: shipped @orb/$name as source"
  done

  # The client ships its BUILD only.
  mkdir -p "$out/packages/client"
  cp -R "$src/packages/client/dist" "$out/packages/client/dist"

  # ── the build identity stamp (owner ask 2026-09-18) ────────────────────────────────────────────────
  # /app/version.json is how a CONTAINER answers "which commit am I?" — an image ships no .git, so nothing
  # else could. `foundation/version` PREFERS this file over any .git at runtime.
  #
  # The derivation is NOT forked here: this invokes the server's own reader (`buildVersionStamp`), the same
  # code that reads the stamp back at boot, so the stamp can never disagree with the reader's rules. The
  # Dockerfile mounts the context's four plain ref files (.dockerignore) at <workspace>/.git-refs for this
  # step only, so git never sees them during `pnpm build`, and the stamp reads them through a `gitdir:`
  # redirect root (the linked-worktree shape the reader already understands). With no refs (an archive build,
  # or a linked worktree whose .git is a file) the mount is empty and the stamp reads the source root.
  # `builtAt` is passed IN rather than read inside the package: production source reads time from the
  # injected clock (the `no-raw-clock` law), and a build script is the one place that legitimately knows the
  # wall instant.
  #
  # `--config.verify-deps-before-run=false`: the stamp reads package.json and the ref files and nothing that
  # an install produced, so pnpm's pre-run dependency check has nothing to verify here. Left on, it would tie
  # the stamp to the stage's install state: a `pnpm deploy` in the same stage rewrites the root
  # node_modules/.pnpm-workspace-state-v1.json, and the check then runs a `pnpm install --production` that aborts
  # without a TTY.
  stamp_root="$src"
  if [ -f "$src/.git-refs/HEAD" ]; then
    stamp_root="$(mktemp -d)"
    cp "$src/package.json" "$stamp_root/package.json"
    printf 'gitdir: %s\n' "$src/.git-refs" > "$stamp_root/.git"
  fi
  ORB_STAMP_ROOT="$stamp_root" \
  ORB_STAMP_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    pnpm --config.verify-deps-before-run=false --silent --dir "$src" run build:version-stamp \
      > "$out/version.json"
  echo "assemble-runtime: stamped version.json = $(cat "$out/version.json")"

  refuse_packages_links "$out/packages"
  echo "assemble-runtime: packages = $(find "$out/packages" -mindepth 1 -maxdepth 1 -exec basename {} \; | sort | tr '\n' ' ')"
}

[ "$#" -eq 4 ] || usage
case "$1" in
  deps) assemble_deps "$2" "$3" "$4" ;;
  app) assemble_app "$2" "$3" "$4" ;;
  *) usage ;;
esac
