# syntax=docker/dockerfile:1
# ── Orbweaver production image — TWO build targets from one shared build ─────────────────────────────
#
#   docker build --target runtime-slim -t orbweaver:<tag>-slim .          # Profile 2: app only
#   docker build --target runtime-gpu  -t orbweaver:<tag>-gpu  .          # Profile 1: app + vLLM fleet
#
# Design: docs/design/containerize-prod-image-spec.md (WHAT — profiles, auth matrix, AUTHFIX-2 trust
# model) + docs/design/docker-modern-practices-research.md (HOW) + docs/design/containerize-build-plan.md
# (the decisions + the coupled sites this file encodes). Deployment wiring: docker-compose.yaml.
#
# The server ships as SOURCE — node 26 runs .ts directly (`pnpm start` ≙ `node packages/server/src/
# entry/index.ts`); the only build artifacts are the generated UI tokens + the client vite bundle. The
# runtime node_modules is the `pnpm deploy --legacy --prod` prune of @orb/server's graph (Fork E), laid
# out workspace-shaped (build plan §1.4) so CLIENT_DIST_DIR's default and the fleet scripts' repo-root
# expectations hold unchanged.
#
# Every base is pinned tag+digest (resolved live 2026-08-08; bump deliberately, re-resolving digests
# with `docker buildx imagetools inspect <ref>`).

# ── Stage 1: deps — the cacheable install ────────────────────────────────────────────────────────────
FROM node:26-bookworm@sha256:0353e48e0e8a993db87b720c242f54b207059d1bcc0106534896e8a11054c837 AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
# Manifests BEFORE source: this layer is reused whenever source changes but the dependency set doesn't.
# `patches/` rides with the manifests — pnpm-workspace.yaml declares patchedDependencies, and a frozen
# install refuses to run without the patch files.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches ./patches
COPY packages/client/package.json    packages/client/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json        packages/db/package.json
COPY packages/kit/package.json       packages/kit/package.json
COPY packages/server/package.json    packages/server/package.json
COPY packages/ui/package.json        packages/ui/package.json
# `git init`: the root `prepare` script is `lefthook install`, which hard-fails outside a git repository
# (probed; LEFTHOOK=0 does not rescue it — build plan §2.4). A throwaway .git satisfies it and never
# reaches a runtime stage. `--ignore-scripts` was rejected: it would also skip the allowBuilds
# postinstalls (sharp, onnxruntime-node, @openrouter/sdk) the runtime needs.
# The pnpm store lives AT the cache-mount target — pnpm's default store path is outside the mount, so a
# cache mount without `store-dir` caches nothing (the store-dir-at-mount gotcha, research §1.1).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    git init --quiet . && \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ── Stage 2: build — generated tokens, client bundle, pruned prod node_modules ───────────────────────
FROM deps AS build
COPY . .
# theme.css + tokens/index.ts are GENERATED from tokens.json — the client build consumes them.
RUN pnpm --filter @orb/ui tokens:build
RUN pnpm --filter @orb/client build
# Fork E: resolve @orb/server's graph (workspace deps materialized, devDeps pruned) into a
# self-contained node_modules. `--legacy` is REQUIRED — this workspace does not set
# inject-workspace-packages, so a bare `pnpm deploy` errors (research §2). `node-linker=hoisted` is
# REQUIRED too, and the build lane's host boot is the receipt: node 26 refuses type-stripping for real
# files under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so the runtime keeps the
# @orb/* SOURCES in the tree behind symlinks (exactly the dev-workspace shape) — and their own deps
# (@libsql, drizzle-orm, …) must then sit at the node_modules TOP LEVEL for the upward walk, which the
# hoisted layout provides and pnpm's default isolated layout does not.
RUN pnpm --filter @orb/server deploy --legacy --prod --config.node-linker=hoisted /app/deploy

# ── Stage 3: app-files — the ONE home for the runtime file set (both runtimes copy exactly this) ─────
# The four @orb workspace packages ship as SOURCE in the tree; each runtime stage replaces the deploy
# output's copied @orb dirs with symlinks to these (the node-26 type-stripping constraint above).
FROM scratch AS app-files
COPY --from=build /app/deploy/node_modules        /app/node_modules
COPY --from=build /app/package.json               /app/package.json
COPY --from=build /app/packages/kit/package.json  /app/packages/kit/package.json
COPY --from=build /app/packages/kit/src           /app/packages/kit/src
COPY --from=build /app/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=build /app/packages/contracts/src     /app/packages/contracts/src
COPY --from=build /app/packages/db/package.json   /app/packages/db/package.json
COPY --from=build /app/packages/db/src            /app/packages/db/src
COPY --from=build /app/packages/server/package.json /app/packages/server/package.json
COPY --from=build /app/packages/server/src        /app/packages/server/src
COPY --from=build /app/packages/client/dist       /app/packages/client/dist
COPY docker/entrypoint.sh                         /app/docker/entrypoint.sh

# ── Target: runtime-slim (Profile 2 — app only; engines off or external) ─────────────────────────────
FROM node:26-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS runtime-slim
WORKDIR /app
ARG GIT_SHA=unknown
ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/Inktomi93/orbweaver" \
      org.opencontainers.image.description="Orbweaver production image (slim app-only profile)" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${IMAGE_VERSION}"
ENV NODE_ENV=production \
    # Secure-by-explicitness: the slim image runs cloud models by default. The D2 external-engine arm
    # overrides at run time: ENGINES_POSTURE=adopt-only + VLLM_ENGINE_HOST=<engine host>.
    ENGINES_POSTURE=off
COPY --link --chown=node:node --from=app-files /app /app
# @orb/* resolve through SYMLINKS to the tree sources — a real .ts dir under node_modules is refused by
# node 26's type stripper (the boot-proof receipt, build plan §2). /app/data is the ONE writable state
# root (sqlite + -wal/-shm, CAS blobs, variants) — a mounted volume; /app/.cache is cwd-relative scratch.
RUN rm -rf /app/node_modules/@orb && mkdir -p /app/node_modules/@orb && \
    ln -s ../../packages/kit       /app/node_modules/@orb/kit && \
    ln -s ../../packages/contracts /app/node_modules/@orb/contracts && \
    ln -s ../../packages/db        /app/node_modules/@orb/db && \
    ln -s ../../packages/server    /app/node_modules/@orb/server && \
    mkdir -p /app/data /app/.cache && chown -R node:node /app/data /app/.cache /app/node_modules/@orb
USER node
EXPOSE 8788
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node","-e","fetch(`http://127.0.0.1:${process.env.PORT??8788}/healthz`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Exec-form so signals reach PID 1 directly; the shim execs node, so with compose `init: true` the chain
# is tini → node. Secrets ride *_FILE indirection through the shim (build plan §1.3).
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node","packages/server/src/entry/index.ts"]

# ── Stage: gpu-base — CUDA 13 runtime + node 26 + the pinned vLLM venv ───────────────────────────────
# CUDA 13.0 is a MEASURED pin, not a guess: the proven bare-metal venv is vLLM 0.22.1 on torch
# 2.11.0+cu130 (build plan §2.1). `-runtime` flavor (not `-base`: engines want cuDNN/cuBLAS; not
# `-devel`: no compilers shipped).
FROM nvidia/cuda:13.0.2-runtime-ubuntu24.04@sha256:6a0e31b59e70890446f2c17356d6efc0d54260090a8c63d6ca7c2ad049db95d2 AS gpu-base
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# node 26 via NodeSource (ubuntu apt has no node 26). curl/ca-certificates stay (the fleet front door
# health-probes with curl); iproute2 (`ss`) + procps (`ps`) are the supervisor's port-owner instruments.
# apt cache mounts keep the layer lean without the rm-lists dance (nothing from a cache mount lands in
# the layer).
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_26.x | bash - && \
    apt-get install -y --no-install-recommends nodejs iproute2 procps
# ubuntu24.04 ships a default `ubuntu` user squatting uid 1000 — drop it and mint `node` (uid/gid 1000,
# matching the official node images so volumes are interchangeable across profiles).
RUN userdel -r ubuntu 2>/dev/null || true; \
    groupadd -g 1000 node && useradd -m -u 1000 -g node -s /bin/bash node
# The vLLM venv, baked EXACTLY where the fleet front door expects it: engines.sh derives the venv path
# from VLLM_STORE_ROOT and ignores VLLM_BIN (build plan §2.2), so the venv lives under the store root
# while the multi-GB model/compile caches are relocated onto the /models volume via explicit
# HF_HOME/VLLM_CACHE_ROOT (a volume mounted AT the store root would shadow the baked venv).
# uv is the repo's proven bootstrap (vllm-setup.sh); pinned to the exact version that built the live
# venv. `--torch-backend=cu130` (not vllm-setup's `auto`): auto inspects the NVIDIA driver, which a
# build container does not have — cu130 is the measured live backend.
COPY --from=ghcr.io/astral-sh/uv:0.9.13@sha256:f07d1bf7b1fb4b983eed2b31320e25a2a76625bdf83d5ff0208fe105d4d8d2f5 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
RUN --mount=type=cache,target=/opt/uv/cache,sharing=locked \
    UV_CACHE_DIR=/opt/uv/cache uv venv --python 3.13 /opt/vllm-store/.cache/vllm/venv && \
    UV_CACHE_DIR=/opt/uv/cache uv pip install --python /opt/vllm-store/.cache/vllm/venv/bin/python --torch-backend=cu130 "vllm>=0.22,<0.23" && \
    echo "vllm>=0.22,<0.23 @ cu130" > /opt/vllm-store/.cache/vllm/venv/.orb-pin && \
    /opt/vllm-store/.cache/vllm/venv/bin/vllm --version
# Optional model bake (Fork D sub-fork): BAKE_MODELS=true pre-pulls the three engine models into
# /models at build. Default false → smaller image, first-boot pull into the mounted volume. A gated-repo
# token rides ONLY a BuildKit secret (never ENV/ARG — it would persist in image history):
#   docker build --secret id=hf_token,src=<file> --build-arg BAKE_MODELS=true --target runtime-gpu .
ARG BAKE_MODELS=false
ARG EMBED_MODEL=Qwen/Qwen3-VL-Embedding-2B
ARG RERANK_MODEL=Qwen/Qwen3-VL-Reranker-2B
ARG GEN_MODEL=Qwen/Qwen3-VL-8B-Instruct
RUN --mount=type=secret,id=hf_token,env=HF_TOKEN,required=false \
    if [ "${BAKE_MODELS}" = "true" ]; then \
      HF_HOME=/models/hf /opt/vllm-store/.cache/vllm/venv/bin/python -c \
        "from huggingface_hub import snapshot_download; [snapshot_download(m) for m in ['${EMBED_MODEL}','${RERANK_MODEL}','${GEN_MODEL}']]"; \
    fi

# ── Target: runtime-gpu (Profile 1 — the all-in-one turnkey default: orb + the 3-engine fleet) ───────
FROM gpu-base AS runtime-gpu
WORKDIR /app
ARG GIT_SHA=unknown
ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/Inktomi93/orbweaver" \
      org.opencontainers.image.description="Orbweaver production image (all-in-one GPU profile: app + vLLM fleet)" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${IMAGE_VERSION}"
ENV NODE_ENV=production \
    # The container IS the fleet owner: the in-server supervisor triggers the detached spawn
    # (engines.sh start) when an engine is down. `docker stop` reaps the whole namespace — the container
    # is the clean lifecycle boundary for the detached-fleet class (spec §3.6).
    ENGINES_POSTURE=adopt-or-start \
    VLLM_STORE_ROOT=/opt/vllm-store \
    VLLM_BIN=/opt/vllm-store/.cache/vllm/venv/bin/vllm \
    VLLM_PY=/opt/vllm-store/.cache/vllm/venv/bin/python3 \
    HF_HOME=/models/hf \
    VLLM_CACHE_ROOT=/models/vllm-cache
COPY --link --chown=node:node --from=app-files /app /app
# The fleet front door + its TS halves + the serve chat-templates, workspace-shaped at the runtime cwd
# (the supervisor runs `bash <cwd>/scripts/dev/engines.sh start`). ONLY the fleet files — the rest of
# scripts/dev is dev tooling.
COPY --chown=node:node scripts/dev/engines.sh scripts/dev/engines.ts scripts/dev/engines-ctl.ts \
     scripts/dev/vllm-setup.sh scripts/dev/qwen3_vl_embedding_serve.jinja \
     scripts/dev/qwen3_vl_reranker_serve.jinja /app/scripts/dev/
# @orb/* resolve through SYMLINKS to the tree sources (the node-26 type-stripping constraint — build
# plan §2); the server symlink additionally serves engines.ts/engines-ctl.ts, which import
# `@orb/server/...` by package name. /app/.cache/stack is the fleet's pidfile/log home; /models is the
# model-cache volume root (baked BAKE_MODELS content, if any, seeds a fresh named volume on first use —
# docker copies image content at the mountpoint into an empty named volume).
RUN rm -rf /app/node_modules/@orb && mkdir -p /app/node_modules/@orb && \
    ln -s ../../packages/kit       /app/node_modules/@orb/kit && \
    ln -s ../../packages/contracts /app/node_modules/@orb/contracts && \
    ln -s ../../packages/db        /app/node_modules/@orb/db && \
    ln -s ../../packages/server    /app/node_modules/@orb/server && \
    mkdir -p /app/data /app/.cache /models && \
    chown -R node:node /app/data /app/.cache /models /app/node_modules/@orb
USER node
EXPOSE 8788
STOPSIGNAL SIGTERM
# start-period covers the COLD fleet spawn (model load + CUDA-graph compile — minutes, spec §3.6); the
# healthcheck itself only gates the APP's /healthz (engines report through engine-status, not health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
  CMD ["node","-e","fetch(`http://127.0.0.1:${process.env.PORT??8788}/healthz`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node","packages/server/src/entry/index.ts"]
