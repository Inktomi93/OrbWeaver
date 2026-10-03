# syntax=docker/dockerfile:1.27.1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# check=error=true
# ── Orbweaver — the ONE production image (app only; engines are yours to run) ────────────────────────
#
#   docker compose -f docker-compose.yaml -f docker/compose.build.yaml up -d --build   # builds this target and runs it
#   docker build --target runtime -t orbweaver:dev .   # bare build (the release workflow publishes this target to GHCR)
#
# WHAT SHIPS: the server as SOURCE (node 26 runs .ts directly — the image CMD is the same
# `node packages/server/src/entry/index.ts` that `pnpm stack up-fg prod` runs on bare metal), the built
# client bundle, and a PRUNED production node_modules. No vLLM, no CUDA, no models: local engines are an
# external server you add as a connection (identical on bare metal and in a container; the 2026-09-18 owner
# ruling retired the GPU all-in-one image so there is ONE engine story to maintain). The previous two-target
# design lives in git history.
#
# LAYOUT (docker/assemble-runtime.sh — the ONE home for the runtime file set): every `@orb/*` workspace
# package the server's production graph pulls in ships as workspace-shaped SOURCE under /app/packages/<name>
# behind a symlink from /node_modules/@orb/<name>, outside the plugin broker's node_modules grant (the
# assembler says why). Two facts force that shape and both were paid for at the first host-side boot (build
# plan §1.4/§2): node 26 refuses type-stripping for real files under
# node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and the packages' own deps must resolve by the
# upward walk to /app/node_modules — which the fully hoisted `pnpm deploy` layout provides. The assembler discovers
# the package set from the deploy output, so adding a workspace package (D160: default content ships as a
# package the server declares) never needs a Dockerfile edit.
#
# CACHE SHAPE (docs.docker.com/build/cache/optimize: "order your layers", less frequently changed first):
#
#   pnpm-version ─> deps (fetch: lockfile │ install: manifests) ─┬─> prod-deps (deploy + prune) ──┐
#                                                                └─> build (client) ─> app files ──┴─> runtime
#
# A source edit never reaches `deps` or `prod-deps`: the store fetch keys on the lockfile alone, the install
# and the production deploy on the workspace manifests, so the runtime image's node_modules layer (the bulk of
# it) is reused as is and only the app-files layer is rebuilt. An edit to a server-only package does not
# re-run the client build either (the `build` stage COPY says why).
#
# The syntax frontend and the bases are pinned tag+digest (bump deliberately:
# `docker buildx imagetools inspect <ref>`). The frontend pin is what makes `check=error=true` safe: a newer
# frontend can add a build check, and an unpinned one would fail the build on the day it ships.

# ── base: the full node image every build stage shares ──────────────────────────────────────────────
FROM node:26.10.0-bookworm@sha256:2aaae6d91f99fee84cfc92da9b52c22a185752d247746052bbc3f961e44478c6 AS base
# Every RUN and heredoc below stops at its first failing command, inside a pipe too.
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
WORKDIR /app

# ── pnpm-version: the repo's pnpm pin, isolated from the rest of package.json ────────────────────────
# node 26 ships WITHOUT corepack (removed from the node 25+ distribution), so the pinned pnpm is installed
# with npm. The version is READ from package.json's `packageManager` field — one home, the image cannot
# drift from the repo pin. (`corepack enable` here was the first line that broke when the image was first
# built for real, 2026-09-18.) This stage re-runs on any package.json edit (every release bumps `version`), but
# its output is one line, and the COPY that reads it keys on that line's content, so the pnpm install and the
# store fetch below are reused until the pin itself moves.
FROM base AS pnpm-version
RUN --mount=type=bind,source=package.json,target=package.json \
    node -p "require('./package.json').packageManager.replace(/^pnpm@/, '').replace(/\+.*$/, '')" > /pnpm-version

# ── deps: the store fetch, then the offline workspace install ────────────────────────────────────────
FROM base AS deps
COPY --from=pnpm-version /pnpm-version /pnpm-version
RUN <<EOF
npm install -g "pnpm@$(cat /pnpm-version)"
pnpm config set store-dir /pnpm/store
EOF
# `pnpm fetch` reads the LOCKFILE ALONE (pnpm.io/docker), so this layer is reused for every change that keeps
# pnpm-lock.yaml the same, and a new workspace package never needs a COPY line here. pnpm 12's fetch also
# imports every package into node_modules/.pnpm, so the virtual store lands in this layer while the tarballs
# stay in the cache mount; a build whose mount is empty (CI, whose layer cache does not carry mounts) still has
# everything the offline install below links from. The store lives AT the mount target (`store-dir` above): a
# mount anywhere else caches nothing. The id scopes the cache to this project on a shared builder (pnpm.io/docker:
# keep a store cache to mutually trusted builds); `shared` because pnpm's store is content-addressed and
# written atomically, which is how one store serves every project on a dev machine.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=orbweaver-pnpm-store,target=/pnpm/store,sharing=shared \
    pnpm fetch
# The install needs every workspace manifest and the files its lifecycle scripts run, and nothing else: the root
# `prepare` (scripts/prepare.ts, which skips without a .git) and the server's `postinstall` media check
# (src/entry/check-media.ts and the one module it imports). The glob picks up a new workspace package; a new
# install-time script that reads another file fails this step loudly instead of being cached around.
COPY --parents package.json packages/*/package.json tooling/package.json scripts/prepare.ts \
     packages/server/src/entry/check-media.ts packages/server/src/infra/media/runtime/ ./
RUN --mount=type=cache,id=orbweaver-pnpm-store,target=/pnpm/store,sharing=shared \
    pnpm install --frozen-lockfile --offline

# ── prod-deps: the server's production node_modules (manifests only, so a source edit never re-runs it) ──
# Its own stage, branched from `deps`, for two reasons: the build stage below never waits on it (BuildKit runs
# the two at once), and the deploy rewrites the root node_modules/.pnpm-workspace-state-v1.json, which would
# make pnpm's pre-run dependency check in `pnpm build` attempt a TTY-only reinstall.
# `--legacy` is required: this workspace does not set inject-workspace-packages. `shamefully-hoist`, not
# `node-linker=hoisted`: pnpm 12's legacy deploy writes an empty node_modules under the hoisted linker. Every
# patched dependency is a dev tool, so a --prod deploy never installs one and pnpm would refuse its patch as
# unused. The store mount is the same one `deps` filled, so the deploy links instead of downloading.
FROM deps AS prod-deps
RUN --mount=type=cache,id=orbweaver-pnpm-store,target=/pnpm/store,sharing=shared \
    pnpm --filter @orb/server deploy --legacy --prod --config.shamefully-hoist=true --config.allow-unused-patches=true /tmp/deploy
RUN --mount=type=bind,source=docker/assemble-runtime.sh,target=/tmp/assemble-runtime.sh \
    sh /tmp/assemble-runtime.sh deps /tmp/deploy /runtime/deps /runtime/links

# ── git-refs: the four plain ref files the version stamp reads (.dockerignore), or nothing ───────────
# The wildcard matches nothing when the context has no .git directory (a source archive, or a linked worktree
# whose .git is a file), and COPY accepts an empty wildcard. Kept out of every other stage so a ref that moves
# (any branch commit in the checkout) re-runs only the stamp, never the client build.
FROM scratch AS git-refs
COPY .gi[t] /

# ── build: the client bundle, then the app half of the runtime file set ─────────────────────────────
FROM deps AS build
# The server-only workspace packages are left out of the client build's input: the package direction lets the
# client import only contracts, kit and ui (AGENTS.md "Package direction"), so an edit to the server, db,
# inference or default-content cannot change the bundle and must not re-run it. The server's media check that
# `pnpm build` runs first reads the two files the `deps` stage already copied. docker/ is mounted where it is
# used, so an entrypoint or assembler edit does not re-run the build either.
COPY --exclude=packages/server --exclude=packages/db --exclude=packages/inference --exclude=packages/default-content \
     --exclude=docker . .
# theme.css + tokens/index.ts are GENERATED from tokens.json before the client build consumes them
# (`pnpm build` = the ui tokens build + `vite build`; one script, shared with the bare-metal docs).
RUN pnpm build
COPY --parents packages/server packages/db packages/inference packages/default-content ./
RUN --mount=type=bind,source=docker/assemble-runtime.sh,target=/tmp/assemble-runtime.sh \
    --mount=type=bind,from=prod-deps,source=/runtime/links,target=/runtime/links \
    --mount=type=bind,from=git-refs,target=/app/.git-refs \
    sh /tmp/assemble-runtime.sh app /app /runtime/links /runtime/app

# ── runtime ──────────────────────────────────────────────────────────────────────────────────────────
FROM node:26.10.0-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runtime
# cloudflared uses the system trust store; the slim base does not contain it.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# The app ignores SIGUSR1, so no process running as its user (the plugin broker included) can open its inspector.
# NODE_OPTIONS, not a CMD flag, so an operator's own `command:` keeps it. The watchdog and broker get an explicit env.
ENV NODE_OPTIONS=--disable-sigusr1
# The image declares itself: the app reads this beside the Docker and Podman marker files, so a runtime that writes
# neither (Kubernetes with containerd or CRI-O) still gets container fix text and never admits the pod name as a host.
ENV ORB_CONTAINER=true
# /app/data is the ONE writable state root (sqlite + -wal/-shm, CAS blobs, generated secrets) — a volume;
# /app/.cache is cwd-relative scratch (a recorder spill when WIRE_CAPTURE=on; nothing on the quiet path).
# No `USER node` here on purpose: the entrypoint starts as root to own the data dir for PUID/PGID (a
# bind-mounted host directory works without a manual chown) and drops to that user with setpriv before
# node runs — the app process is never root. `docker run --user` / compose `user:` still works (the
# entrypoint then skips the chown).
RUN install -d -o node -g node /app/data /app/.cache
# `--link` puts each copy on its own layer, independent of the layers under it, so a rebuilt app half never
# re-exports the node_modules layer and a base bump re-uses both (Dockerfile reference, COPY --link). It cannot
# read the image's /etc/passwd, so the owner is the `node` user by number; a linked copy also gives /app itself
# that owner.
COPY --link --from=prod-deps /runtime/links /node_modules
COPY --link --chown=1000:1000 --from=prod-deps /runtime/deps/node_modules /app/node_modules
COPY --link --chown=1000:1000 --from=build /runtime/app /app
COPY --link --chown=1000:1000 docker/entrypoint.sh /app/docker/entrypoint.sh
# The media CLI must run from the final layout on the slim base, not only in the build stage.
RUN node packages/server/src/entry/check-media.ts
EXPOSE 8788
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node","-e","fetch(`http://127.0.0.1:${process.env.PORT??8788}/healthz`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Exec-form so signals reach PID 1; the shim execs node, so with compose `init: true` the chain is
# tini → node. The app reads *_FILE secrets; the shim also generates the files a fresh
# container cannot ask a browser for (docker/entrypoint.sh).
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node","packages/server/src/entry/index.ts"]
# Last, because a RUN after an ARG whose value changed misses the cache (Dockerfile reference, ARG "Impact on
# build caching"), and the release workflow passes a new GIT_SHA and IMAGE_VERSION every time.
ARG GIT_SHA=unknown
ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.title="Orbweaver" \
      org.opencontainers.image.source="https://github.com/Inktomi93/orbweaver" \
      org.opencontainers.image.url="https://github.com/Inktomi93/orbweaver" \
      org.opencontainers.image.documentation="https://github.com/Inktomi93/orbweaver/wiki" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.description="Orbweaver — self-hosted AI roleplay chat (app only; bring your own model server or API key)" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${IMAGE_VERSION}"
