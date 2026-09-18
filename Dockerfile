# syntax=docker/dockerfile:1
# ── Orbweaver — the ONE production image (app only; engines are yours to run) ────────────────────────
#
#   docker compose up -d --build                       # builds this target and runs it (docker/README.md)
#   docker build --target runtime -t orbweaver:dev .   # bare build
#
# WHAT SHIPS: the server as SOURCE (node 26 runs .ts directly — the image CMD is the same
# `node packages/server/src/entry/index.ts` that `pnpm stack start-fg prod` runs on bare metal), the built
# client bundle, and a PRUNED production node_modules. No vLLM, no CUDA, no models: local engines are an
# external server you point the app at (ENGINES_POSTURE=adopt-only + VLLM_ENGINE_HOST — identical on bare
# metal and in a container; the 2026-09-18 owner ruling retired the GPU all-in-one image so there is ONE
# engine story to maintain). The previous two-target design lives in git history and
# docs/design/containerize-build-plan.md (status banner there).
#
# LAYOUT (docker/assemble-runtime.sh — the ONE home for the runtime file set): every `@orb/*` workspace
# package the server's production graph pulls in ships as workspace-shaped SOURCE under /app/packages/<name>
# behind a symlink from /app/node_modules/@orb/<name>. Two facts force that shape and both were paid for at
# the first host-side boot (build plan §1.4/§2): node 26 refuses type-stripping for real files under
# node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and the packages' own deps must resolve by the
# upward walk to /app/node_modules — which the HOISTED `pnpm deploy` layout provides. The assembler discovers
# the package set from the deploy output, so adding a workspace package (D160: default content ships as a
# package the server declares) never needs a Dockerfile edit.
#
# Bases are pinned tag+digest (bump deliberately: `docker buildx imagetools inspect <ref>`).

# ── Stage 1: deps — the cached dependency fetch ──────────────────────────────────────────────────────
FROM node:26-bookworm@sha256:0353e48e0e8a993db87b720c242f54b207059d1bcc0106534896e8a11054c837 AS deps
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
# `git init`: the root `prepare` script is `lefthook install`, which hard-fails outside a git repository
# (LEFTHOOK=0 does not rescue it). A throwaway .git satisfies it and never reaches the runtime stage.
# `--ignore-scripts` is NOT an option: it would also skip the allowBuilds postinstalls (sharp,
# onnxruntime-node) the runtime needs.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    git init --quiet . && \
    pnpm install --frozen-lockfile --offline
# theme.css + tokens/index.ts are GENERATED from tokens.json before the client build consumes them
# (`pnpm build` = the ui tokens build + `vite build`; one script, shared with the bare-metal docs).
RUN pnpm build
# The server's production graph, workspace deps materialized, dev deps pruned, HOISTED (see the header).
# `--legacy` is required: this workspace does not set inject-workspace-packages.
RUN pnpm --filter @orb/server deploy --legacy --prod --config.node-linker=hoisted /app/deploy
RUN sh docker/assemble-runtime.sh /app /app/deploy /app/runtime

# ── Stage 3: runtime ─────────────────────────────────────────────────────────────────────────────────
FROM node:26-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS runtime
WORKDIR /app
ARG GIT_SHA=unknown
ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/Inktomi93/orbweaver" \
      org.opencontainers.image.description="Orbweaver — self-hosted AI roleplay chat (app only; bring your own model server or API key)" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${IMAGE_VERSION}"
ENV NODE_ENV=production \
    # No engine supervisor in the image. Point the app at YOUR vLLM with ENGINES_POSTURE=adopt-only +
    # VLLM_ENGINE_HOST at run time (docker/orbweaver.env).
    ENGINES_POSTURE=off
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
