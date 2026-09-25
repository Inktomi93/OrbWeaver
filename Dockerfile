# syntax=docker/dockerfile:1
# ── Orbweaver — the ONE production image (app only; engines are yours to run) ────────────────────────
#
#   docker compose up -d --build                       # builds this target and runs it (docker/README.md)
#   docker build --target runtime -t orbweaver:dev .   # bare build
#
# WHAT SHIPS: the server as SOURCE (node 26 runs .ts directly — the image CMD is the same
# `node packages/server/src/entry/index.ts` that `pnpm stack start-fg prod` runs on bare metal), the built
# client bundle, and a PRUNED production node_modules. No vLLM, no CUDA, no models: local engines are an
# external server you add as a connection (identical on bare metal and in a container; the 2026-09-18 owner
# ruling retired the GPU all-in-one image so there is ONE engine story to maintain). The previous two-target
# design lives in git history and
#  (status banner there).
#
# LAYOUT (docker/assemble-runtime.sh — the ONE home for the runtime file set): every `@orb/*` workspace
# package the server's production graph pulls in ships as workspace-shaped SOURCE under /app/packages/<name>
# behind a symlink from /app/node_modules/@orb/<name>. Two facts force that shape and both were paid for at
# the first host-side boot (build plan §1.4/§2): node 26 refuses type-stripping for real files under
# node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and the packages' own deps must resolve by the
# upward walk to /app/node_modules — which the fully hoisted `pnpm deploy` layout provides. The assembler discovers
# the package set from the deploy output, so adding a workspace package (D160: default content ships as a
# package the server declares) never needs a Dockerfile edit.
#
# Bases are pinned tag+digest (bump deliberately: `docker buildx imagetools inspect <ref>`).

# ── Stage 1: deps — the cached dependency fetch ──────────────────────────────────────────────────────
FROM node:26.10.0-bookworm@sha256:2aaae6d91f99fee84cfc92da9b52c22a185752d247746052bbc3f961e44478c6 AS deps
WORKDIR /app
# node 26 ships WITHOUT corepack (removed from the node 25+ distribution), so the pinned pnpm is installed
# with npm. The version is READ from package.json's `packageManager` field — one home, the image cannot
# drift from the repo pin. (`corepack enable` here was the first line that broke when the image was first
# built for real, 2026-09-18.)
COPY package.json ./
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.replace(/^pnpm@/, '').replace(/\+.*$/, '')")"
# `pnpm fetch` fills the store from the LOCKFILE ALONE — no workspace manifests needed, so this layer is
# reused for every source change that keeps pnpm-lock.yaml the same, and a new workspace package never
# needs a COPY line here. The store lives AT the cache-mount target: pnpm's default store path is outside
# the mount, and a mount without `store-dir` caches nothing.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm fetch

# ── Stage 2: build — install (offline), generated tokens, client bundle, pruned prod node_modules ─────
FROM deps AS build
COPY . .
# The four un-ignored .git ref files (.dockerignore) exist for the version stamp ONLY (assemble-runtime.sh
# reads them through a `gitdir:` redirect). git itself must NOT see them: a HEAD that names a commit with no
# object store behind it is a dangling ref, and the ui token ratchet (`packages/ui/token-contract.ts`) then
# tries `git merge-base HEAD origin/main`, which no build context can satisfy — the build broke there
# 2026-09-18. With no .git at all the build is a source archive: the root `prepare` script (scripts/prepare.ts)
# skips the lefthook install, and the token ratchet has no history to ratchet against.
RUN if [ -d .git ]; then mv .git /app/.git-refs; fi
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --offline
# theme.css + tokens/index.ts are GENERATED from tokens.json before the client build consumes them
# (`pnpm build` = the ui tokens build + `vite build`; one script, shared with the bare-metal docs).
RUN pnpm build
# The server's production graph, workspace deps materialized, dev deps pruned, every package hoisted to the top
# of node_modules (see the header). `--legacy` is required: this workspace does not set
# inject-workspace-packages. `shamefully-hoist`, not `node-linker=hoisted`: pnpm 12's legacy deploy writes an
# empty node_modules under the hoisted linker. Every patched dependency is a dev tool, so a --prod deploy never
# installs one and pnpm would refuse its patch as unused.
RUN pnpm --filter @orb/server deploy --legacy --prod --config.shamefully-hoist=true --config.allow-unused-patches=true /app/deploy
RUN sh docker/assemble-runtime.sh /app /app/deploy /app/runtime

# ── Stage 3: runtime ─────────────────────────────────────────────────────────────────────────────────
FROM node:26.10.0-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runtime
WORKDIR /app
ARG GIT_SHA=unknown
ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/Inktomi93/orbweaver" \
      org.opencontainers.image.description="Orbweaver — self-hosted AI roleplay chat (app only; bring your own model server or API key)" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${IMAGE_VERSION}"
ENV NODE_ENV=production
# The image declares itself: the app reads this beside the Docker and Podman marker files, so a runtime that writes
# neither (Kubernetes with containerd or CRI-O) still gets container fix text and never admits the pod name as a host.
ENV ORB_CONTAINER=true
COPY --chown=node:node --from=build /app/runtime /app
COPY --chown=node:node docker/entrypoint.sh /app/docker/entrypoint.sh
# /app/data is the ONE writable state root (sqlite + -wal/-shm, CAS blobs, generated secrets) — a volume;
# /app/.cache is cwd-relative scratch (a recorder spill when WIRE_CAPTURE=on; nothing on the quiet path).
# No `USER node` here on purpose: the entrypoint starts as root to own the data dir for PUID/PGID (a
# bind-mounted host directory works without a manual chown) and drops to that user with setpriv before
# node runs — the app process is never root. `docker run --user` / compose `user:` still works (the
# entrypoint then skips the chown).
RUN mkdir -p /app/data /app/.cache && chown node:node /app/data /app/.cache
EXPOSE 8788
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node","-e","fetch(`http://127.0.0.1:${process.env.PORT??8788}/healthz`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Exec-form so signals reach PID 1; the shim execs node, so with compose `init: true` the chain is
# tini → node. Secrets ride *_FILE indirection through the shim; the shim also fills the two values a fresh
# container cannot ask a browser for (docker/entrypoint.sh).
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node","packages/server/src/entry/index.ts"]
