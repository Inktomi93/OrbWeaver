---
kind: research
status: draft
updated: 2026-08-14
---

# Modern Docker/BuildKit/Compose practices — builder brief for the two-profile prod image

> Companion to `docs/design/containerize-prod-image-spec.md`. That spec decides WHAT to ship (two
> profiles, four auth modes, the AUTHFIX-2 trust model). This brief decides HOW to build it with
> CURRENT (Aug 2026) Docker tooling — each recommendation is a concrete directive/syntax, scoped to
> Profile 1 (all-in-one GPU) vs Profile 2 (slim app-only) where they differ. Sources at the bottom.
>
> **Repo facts that pin several choices (verified this pass):** pnpm `11.15.1` (`package.json:6`);
> workspace does NOT set `inject-workspace-packages` and has NO `node-linker` override
> (`pnpm-workspace.yaml` — default `isolated` linker, no dep injection); `engineStrict: true` gates
> node `>=26`; there is deliberately NO `.npmrc`. These drive Fork E (§2) and the base-image pin (§3).

---

## 0. TL;DR decision table

| Concern | Profile 1 (all-in-one GPU) | Profile 2 (slim app-only) |
| - | - | - |
| Runtime base | `nvidia/cuda:12.x.y-runtime-ubuntu24.04` + NodeSource node 26 | `node:26-bookworm-slim` |
| Builder base | `node:26-bookworm` (full, not slim) | `node:26-bookworm` |
| PID 1 | `--init` / compose `init: true` (fleet spawns children — reaping matters) | `--init` (cheap insurance) |
| Runtime deps | `pnpm deploy --legacy --prod` pruned dir (§2) | same |
| GPU wiring | compose `deploy.resources.reservations.devices` **or** `gpus: all` | none |
| shm | `shm_size: "8gb"` (vLLM) | default |
| Port | `expose: ["8788"]` only | `expose: ["8788"]` only |
| Healthcheck | `start_period: 300s` (cold fleet) | `start_period: 30s` |
| read-only rootfs | NO (model cache / vLLM scratch write) — or narrow tmpfs | YES + tmpfs (§6) |
| multi-arch | amd64 ONLY (CUDA) | amd64 primary; arm64 possible but unneeded |

Cross-cutting (both): BuildKit cache mounts for the pnpm store; secret MOUNTS never `ENV`/`ARG`;
non-root `USER`; pin bases by digest; OCI labels + SBOM/provenance attestations on push;
`.dockerignore` the world; `no-new-privileges`.

---

## 1. Multi-stage build for the pnpm workspace

### 1.1 Stage split (shared app layer — both profiles)

Three logical stages. Keep the dependency-manifest copy SEPARATE from the source copy so a source-only
change does not bust the install layer.

```dockerfile
# syntax=docker/dockerfile:1   <-- REQUIRED first line to enable --mount=type=cache/secret
```

`# syntax=docker/dockerfile:1` pins the frontier to the current stable 1.x line; BuildKit is the
default builder in Docker Engine 23+ so no `DOCKER_BUILDKIT=1` is needed on a modern host, but the
syntax directive is still what unlocks `RUN --mount`.

**Stage 1 — deps (the cacheable install):**

```dockerfile
FROM node:26-bookworm AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
# Copy ONLY manifests first — this layer is reused whenever source changes but deps don't.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/client/package.json   packages/client/package.json
COPY packages/server/package.json   packages/server/package.json
COPY packages/ui/package.json       packages/ui/package.json
COPY packages/kit/package.json      packages/kit/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json       packages/db/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile
```

- **`corepack prepare pnpm@11.15.1`** — pin to the repo's `packageManager`, NOT the devcontainer's
  older pnpm. Corepack ships in node 26.
- **`--mount=type=cache,id=pnpm-store,target=/pnpm/store`** — the pnpm content-addressable store is
  cached ACROSS builds. The store must live where pnpm writes it, so set `store-dir` to the mount
  target explicitly (pnpm's default is under `$XDG_DATA_HOME` / `~/.local/share/pnpm`, which is not
  the mount). The cache is a build-cache, never a layer — nothing from it lands in the image.
- **`--frozen-lockfile`** — fail if `pnpm-lock.yaml` is stale; the CAS + lockfile give deterministic
  installs. `minimumReleaseAge` in the workspace does NOT bite frozen installs (no re-resolution).
- **`engineStrict: true`** means a node-major mismatch in the builder FAILS the install — so the
  builder base MUST be node 26, not 24/22.

**Stage 2 — build (client dist + generated tokens):**

```dockerfile
FROM deps AS build
COPY . .
RUN pnpm --filter @orb/ui tokens:build      # theme.css + tokens/index.ts are GENERATED (spec §2)
RUN pnpm --filter @orb/client build         # -> packages/client/dist
```

Reuse the warm store cache mount here too if any step re-resolves. `COPY . .` is where
`.dockerignore` (§5) earns its keep — without it the whole `data/`, `.git`, `node_modules`, test tree
get shipped into the build context and bust caching.

**Stage 3 — runtime:** see §3 (differs per profile) and §2 (the pruned node_modules).

### 1.2 BuildKit cache mount reference

`RUN --mount=type=cache,target=<dir>[,id=<id>][,sharing=shared|private|locked]`

- `target` (required), `id` (defaults to target), `sharing` default `shared`. For a pnpm store,
  `sharing=locked` avoids two concurrent builds corrupting the store; `shared` is fine for a single
  build lane. Cache mounts persist on the BUILDER, not in the image, and are the single biggest
  build-speed win for a monorepo install.

### 1.3 `COPY --link` and `--chown`

- **`COPY --link`** decouples a COPY from the parent-chain digest so a base-image change (e.g. a CUDA
  digest bump) doesn't invalidate later app COPY layers — use it for the big model/asset copies in
  Profile 1. Caveat: `--link` copies into a fresh layer and cannot see prior filesystem state, so use
  plain `COPY` where you need to overlay onto an existing dir.
- **`COPY --chown=node:node`** sets ownership at copy time (cheaper than a later `RUN chown -R`).
  Use it for `/app` and the data dir scaffold.

---

## 2. Production dependency pruning — Fork E (the load-bearing one)

The server runs `.ts` SOURCE under node 26 and imports `@orb/kit|contracts|db` as source. A naive
`--prod` prune can drop a workspace package node needs at runtime; the full install drags in
vitest/playwright/stryker (hundreds of MB). `pnpm deploy` is the right tool — it resolves the
workspace graph for ONE package into a self-contained, portable directory.

**THE REPO GOTCHA (verified):** `pnpm deploy` in pnpm 10+/11 by default REQUIRES
`inject-workspace-packages: true` in the workspace. This repo does NOT set it. So a bare
`pnpm deploy` will error. Two supported ways forward:

```dockerfile
# In the build stage, after the full install:
RUN pnpm --filter @orb/server deploy --legacy --prod /app/deploy
```

- **`--legacy`** (or workspace `force-legacy-deploy: true`) — makes `pnpm deploy` work WITHOUT the
  injected-dependencies mode, which matches this workspace's current config. Recommended: pass
  `--legacy` on the CLI so you don't mutate `pnpm-workspace.yaml` just for the container.
- **`--prod`** — skips `devDependencies`. Safe here BECAUSE the client is already built in Stage 2;
  the server runtime needs only prod deps + the workspace source packages, which `deploy` copies in.
- Output `/app/deploy` is a portable dir: `deploy/node_modules` (isolated, real dirs not symlinks
  into the store), `deploy/packages/*` source, `deploy/package.json`. Copy THAT into the runtime
  stage instead of the workspace's symlinked `node_modules`.

**Runtime-boot PROOF is mandatory before closing Fork E** (spec A4 + Fork E): node 26 strips TS types
natively but CANNOT run TS `enum`, `namespace`, or legacy decorators without a transform. The build
lane MUST boot the runtime image and hit `/healthz` 200 to prove no server/kit/contracts/db `.ts` on
the hot path uses an unsupported construct. If one does, that package needs a compile step — do not
assume; test.

**Fallback arm (Fork E):** if `pnpm deploy --legacy` mis-prunes something (a dynamic import the graph
resolver misses), carry the full `--frozen-lockfile` install into runtime and eat the size. Prove
boot either way.

---

## 3. Base images

### 3.1 Profile 2 — slim app-only

- **Builder:** `node:26-bookworm` (full — has git/python/build-essential for any native rebuild;
  `sharp`, `@libsql/client`, `onnxruntime-node` have native bindings).
- **Runtime:** `node:26-bookworm-slim`. Debian glibc — NOT Alpine/musl (spec Fork A: native `@libsql`
  - node's TS type-strip are lower-risk on glibc; devcontainer's proven path is Debian). Slim drops
    the ~150MB of build tooling but keeps a shell (the healthcheck and ops want it) — do NOT use
    distroless (loses shell; node-distroless lags the 26 tag).
- Concrete tags available now: `26-bookworm-slim`, `26.7-bookworm-slim`, `26.7.0-bookworm-slim`. Pin
  the full `MAJOR.MINOR.PATCH` **and** the digest (§7).

### 3.2 Profile 1 — CUDA + node 26

Layer node ONTO CUDA (not CUDA onto node): the CUDA userspace libs + the NVIDIA container runtime
contract are the hard part; node is a clean add.

- **Base:** `nvidia/cuda:12.x.y-runtime-ubuntu24.04` (the `-runtime` flavor, NOT `-base` which lacks
  cuDNN/cuBLAS the engines want, and NOT `-devel` which is multi-GB of compilers you don't ship).
  Match `12.x` to what the vendored vLLM build requires — confirm against the vLLM wheel's CUDA
  minor in the build lane; `12.6`/`12.8` runtime-ubuntu24.04 tags are live, and NVIDIA now publishes
  a CUDA 13.x / ubuntu 26.04 line too. Pin whichever the vLLM wheel is built against, by digest.
- **Add node 26** via NodeSource (Ubuntu has no node 26 in apt):

```dockerfile
FROM nvidia/cuda:12.8.0-runtime-ubuntu24.04 AS runtime-gpu
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg python3 && \
    curl -fsSL https://deb.nodesource.com/setup_26.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    corepack enable && corepack prepare pnpm@11.15.1 --activate
```

- The `apt` cache mounts + `--no-install-recommends` keep the layer lean; because it's a cache mount
  you can SKIP `rm -rf /var/lib/apt/lists` (nothing lands in the layer) — but if you drop the cache
  mounts, you MUST `apt-get clean && rm -rf /var/lib/apt/lists/*` in the SAME `RUN` (anti-pattern
  otherwise — §8).
- **NVIDIA runtime env** the CUDA base already sets (`NVIDIA_VISIBLE_DEVICES=all`,
  `NVIDIA_DRIVER_CAPABILITIES=compute,utility`) — for vLLM you likely want
  `NVIDIA_DRIVER_CAPABILITIES=compute,utility` (default is fine; add `video` only if you decode).
- `VLLM_BIN`/`VLLM_PY`/`HF_HOME`/`VLLM_CACHE_ROOT` point at in-image paths (spec §3.6). The vLLM
  install + model bake is the heavy part — sub-fork: bake models (turnkey, multi-GB image) vs mount
  an HF-cache volume (smaller image, first-boot pull). Either way `HF_HOME` must be writable at
  runtime (rules out a fully read-only rootfs on Profile 1 unless that path is a tmpfs/volume).

### 3.3 Runtime stage skeleton (Profile 2 shown; Profile 1 swaps the FROM + adds §3.2)

```dockerfile
FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# non-root: the base already ships uid/gid 1000 `node`
COPY --chown=node:node --from=build /app/deploy ./
COPY --chown=node:node --from=build /app/packages/client/dist ./packages/client/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8788
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node","--enable-source-maps","packages/server/src/entry/index.ts"]
```

- Profile 1: `--start-period=300s` (cold fleet, spec §3.6). See §4 for the exact HEALTHCHECK numbers.
- `ENTRYPOINT` (not `CMD`) so args aren't accidentally overridden; keep it exec-form (JSON array) so
  signals reach node directly (shell-form forks a `/bin/sh` that eats SIGTERM).

---

## 4. PID 1 / signal handling

The server spawns a **detached `setsid` vLLM fleet** (spec §3.6). Detached children are re-parented to
PID 1; if PID 1 doesn't reap, they become zombies. Node was not written to be a reaping init.

- **Recommended: `--init` at the run boundary**, not a baked tini. Docker ships tini inside the
  engine; `docker run --init` / compose `init: true` injects it as PID 1, your node is PID 2, signals
  forward and zombies get reaped. Zero Dockerfile change, no extra binary to pin/patch.
  - compose: `init: true` on the service.
  - Keep `STOPSIGNAL SIGTERM` and make node handle SIGTERM for graceful shutdown (close the SSE
    sockets, flush). tini forwards SIGTERM to node; node must actually exit on it or `docker stop`
    waits the full 10s then SIGKILLs.
- **Alternative (baked):** `ENTRYPOINT ["/usr/bin/tini","--","node",...]` after
  `apt-get install -y tini`. Use ONLY if you can't guarantee `--init`/`init: true` at every run site.
  Baking pins a tini version you now own.
- **Important nuance for Profile 1:** `docker stop` reaps the whole PID namespace — the fleet dies
  with the container (spec §3.6, "clean lifecycle boundary"). tini's reaping matters for the STEADY
  state (an engine that exits and gets re-spawned leaves a zombie without a reaper), not for teardown.

---

## 5. `.dockerignore` (both profiles)

A fat build context is slow AND a secret-leak risk (`.env`, `data/`). Ship a strict `.dockerignore`:

```
.git
.env
.env.*
data/
node_modules
**/node_modules
packages/client/dist
.devcontainer
.claude
reports/
docs/
tests/
.cache
.stryker-tmp
*.log
.DS_Store
```

- `.env` and `data/` are the load-bearing exclusions (secrets + state — spec §2/§5). `.env.*` catches
  `.env.local` etc.
- `packages/client/dist` is EXCLUDED from context (it's rebuilt in Stage 2) but BAKED from the build
  stage — those aren't in tension: context-ignore keeps a stale local dist out; the image gets the
  freshly-built one.
- `node_modules` + `**/node_modules` — never ship the host's symlinked store; the runtime gets the
  `pnpm deploy` dir.
- `docs/`, `tests/`, `reports/`, `.stryker-tmp`, `.claude` — dev/test-only, per spec §2.

---

## 6. Compose (v2) integration

### 6.1 GPU access — TWO valid syntaxes (Profile 1)

Both work on current Compose; pick one.

**Classic (widest compatibility, what the spec drafts):**

```yaml
services:
  orbweaver:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all          # or an integer, or use device_ids: ["0","1"]
              capabilities: [gpu]  # REQUIRED; add "utility" only if you need nvidia-smi tooling
```

**Newer short form (`gpus:`):** Compose added a top-level `gpus:` attribute (`gpus: all` or a list of
device requests) as a terser equivalent. It's supported on current Compose v2, but the
`deploy.resources.reservations.devices` form is the most broadly documented and portable — **use the
classic form** unless you've confirmed the deploy host's Compose version. Do NOT set both.

- Requires the **NVIDIA Container Toolkit** on the host (registers the `nvidia` runtime). `capabilities`
  MUST include `gpu`; omitting it is the #1 "no CUDA device" mistake.
- `count: all` ≙ the `--gpus all` the spec calls for. Engines bind loopback inside the container, so
  do NOT expose engine ports.

### 6.2 Ports, shm, health, deps, env, secrets

```yaml
services:
  orbweaver:
    image: orbweaver:<tag>-gpu        # Profile 2: orbweaver:<tag>-slim
    init: true                        # PID-1 reaper (§4)
    expose: ["8788"]                  # NEVER ports: (spec §4 — the owner-fallback hole)
    env_file:
      - path: ./secrets/orbweaver.env
        required: true
    secrets:
      - session_secret
      - oidc_client_secret
      - credentials_key
    volumes:
      - orbweaver_data:/app/data      # sqlite + CAS + variants (the ONLY writable state)
      - hf_cache:/models              # Profile 1 only, if models not baked
    shm_size: "8gb"                   # Profile 1 (vLLM); omit for Profile 2
    healthcheck:
      test: ["CMD","node","-e","fetch('http://127.0.0.1:8788/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 300s              # Profile 1 cold fleet; 30s for Profile 2
    depends_on:
      caddy:
        condition: service_started
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]
    networks: { inktomi-net: {} }
    deploy:                           # Profile 1 only
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

secrets:
  session_secret:      { file: ./secrets/session_secret }
  oidc_client_secret:  { file: ./secrets/oidc_client_secret }
  credentials_key:     { file: ./secrets/credentials_key }
```

- **`expose:` not `ports:`** — the primary AUTHFIX-2 control (spec §4). `expose` keeps the port on the
  compose network only (Caddy reaches it by service DNS `orbweaver:8788`); a `ports:` mapping reopens
  the Host-spoof owner-fallback hole.
- **`healthcheck.start_period`** — during the start period a failing check does NOT count toward
  `retries` and does NOT mark unhealthy; Profile 1 needs minutes because the cold vLLM fleet spawn is
  slow (~34GiB/card to warm). There's also a newer `start_interval` (probe more frequently during the
  start period) — optional nicety.
- **`shm_size: "8gb"`** — vLLM's tensor-parallel workers use `/dev/shm`; the 64MB default deadlocks
  them. Profile 2 doesn't need it.
- **`depends_on: {caddy: {condition: service_started}}`** — orbweaver doesn't need Caddy HEALTHY to
  boot; `service_started` avoids a false ordering dependency. (Use `service_healthy` only where the
  dependency must be ready-to-serve first.)
- **`secrets:`** — compose file/`external` secrets mount at `/run/secrets/<name>` as tmpfs files, out
  of the image and out of `docker inspect`. Prefer these over plaintext env for
  `SESSION_SECRET`/`OIDC_CLIENT_SECRET`/`CREDENTIALS_KEY`. The app reads `process.env` (spec §2), so
  either (a) point the env var at the file path and have the entrypoint read it, or (b) if the app
  only reads env, use `env_file` with a `chmod 600` file that is NOT baked and NOT committed — the
  file-secret path is stronger, use it where the code supports reading a `*_FILE` variant; otherwise
  `env_file` with tight perms is the pragmatic arm. (Flag: check whether the env schema supports
  `_FILE`-suffixed secret indirection; if not, that's a small code add worth making.)
- **`env_file` long form** (`path:` + `required: true`) is current Compose; a missing required file
  fails fast instead of silently booting with unset secrets → boot-fatal `superRefine` (spec §1).

### 6.3 Hardening knobs (Profile 2 can go furthest)

```yaml
    read_only: true                   # Profile 2 — rootfs immutable
    tmpfs:
      - /tmp
    # /app/data is a named volume (writable); everything else read-only.
```

- **`read_only: true` + `tmpfs: [/tmp]`** works for Profile 2: the only writable path the app needs is
  `/app/data` (a volume). node's TS type-strip and libSQL write only under cwd `./data`. Verify no
  library writes to `$HOME`/`/tmp` beyond what the tmpfs covers.
- **Profile 1 CANNOT be fully read-only** — vLLM writes compiled kernels/`HF_HOME`/`VLLM_CACHE_ROOT`
  and torch inductor cache. Either leave rootfs writable, or read-only + mount tmpfs/volume for each
  vLLM scratch path (more work; validate the exact paths against the vLLM version).
- **`cap_drop: [ALL]`** then add back nothing (the app binds a high port 8788, no privileged caps
  needed). **`no-new-privileges:true`** blocks setuid escalation.
- **`user:` in compose** can override, but the image already `USER node`; don't fight it.

### 6.4 Caddy repoint (spec §6)

`reverse_proxy host.docker.internal:8788` → `reverse_proxy orbweaver:8788` (service DNS on
`inktomi-net`). Keep `flush_interval -1` + the 1800s timeouts (SSE). Caddy must pass
`X-Forwarded-Proto/Host/For` (default) for the oidc callback contract — do not strip.

### 6.5 `docker compose watch` / `develop` — NOT for prod

Compose v2's `develop.watch` (sync/rebuild on file change) is a DEV-loop feature; it has no place in
the prod compose file. Mentioned only to say: don't add a `develop:` block to the shipped compose.
`docker init` (the scaffold generator) is also dev-ergonomics — it won't produce anything close to
this two-profile GPU setup; hand-write the Dockerfile/compose.

---

## 7. Supply chain: labels, attestations, pinning, multi-arch

### 7.1 OCI labels

```dockerfile
LABEL org.opencontainers.image.source="https://github.com/<org>/orbweaver" \
      org.opencontainers.image.description="Orbweaver production image" \
      org.opencontainers.image.licenses="<license>" \
      org.opencontainers.image.revision="<git-sha>" \
      org.opencontainers.image.version="<tag>"
```

Prefer passing `revision`/`version`/`created` as build args from CI (`--build-arg`) so they're
accurate. `org.opencontainers.image.source` is what wires the image to its repo on GHCR.

### 7.2 SBOM + provenance attestations

Build with buildx and attach attestations as OCI referrers (they only persist when PUSHED to a
registry, and only with the containerd/OCI image store — the legacy docker image store drops them):

```
docker buildx build \
  --sbom=true \
  --provenance=mode=max \
  --tag ghcr.io/<org>/orbweaver:<tag>-slim \
  --push .
```

- **`--sbom=true`** (≙ `--attest type=sbom`) — BuildKit runs Syft, attaches an SPDX SBOM bound to the
  image digest. **`--provenance=mode=max`** — SLSA provenance predicate (build inputs, source), the
  level needed for SLSA L2. `mode=min` is the lighter default.
- Requires the containerd image store enabled on the builder (default in current Docker Desktop /
  opt-in on Engine). Verify with `docker buildx imagetools inspect <ref>` after push.

### 7.3 Pin by digest

Pin every base by digest, not just tag — a tag is mutable:

```dockerfile
FROM node:26-bookworm-slim@sha256:<digest> AS runtime
FROM nvidia/cuda:12.8.0-runtime-ubuntu24.04@sha256:<digest> AS runtime-gpu
```

Resolve the digest at build time and record it; renovate/dependabot can bump the digest with a
changelog. **Anti-pattern to avoid: `latest`** (spec calls this out) — every base and the app tag get
an explicit version.

### 7.4 Multi-arch

- **Profile 1: amd64 ONLY.** The CUDA/vLLM stack is x86-64; NVIDIA does publish arm64 CUDA (Jetson/
  Grace) but the vLLM+A6000 target here is x86 — do NOT waste a build on `linux/arm64`. Declare
  `--platform linux/amd64` explicitly so a build on an arm CI host doesn't emulate.
- **Profile 2: amd64 is the deploy target** (the inktomi host). node 26 has arm64 images and the app
  is arch-agnostic, so a `linux/amd64,linux/arm64` buildx matrix is POSSIBLE if a cloud deployer wants
  arm — but `sharp`/`onnxruntime-node`/`@libsql` pull native binaries per-arch, so test both if you
  publish both. Default: ship amd64; add arm64 only on demand.

---

## 8. Anti-patterns to avoid (the spec could tempt these)

- **Baking secrets** — no `ENV SESSION_SECRET=`, no `ARG` for secrets (persists in image history/
  metadata), no `COPY .env`. Use `--mount=type=secret` at build (if a build step ever needs one — e.g.
  an HF token to bake models) and compose `secrets:`/`env_file` at runtime. The build-time HF token to
  pull gated models is the ONE place `--mount=type=secret,id=hf_token,env=HF_TOKEN` is right — never
  `ENV HF_TOKEN`.
- **`latest` / floating tags** on any base — pin MAJOR.MINOR.PATCH + digest (§7.3).
- **Running as root** — always `USER node` before the entrypoint; `cap_drop: [ALL]` +
  `no-new-privileges`.
- **`apt` without cleanup** — either use apt cache mounts (nothing lands) OR `apt-get clean && rm -rf
  /var/lib/apt/lists/*` in the SAME `RUN`; always `--no-install-recommends`.
- **Fat build context** — strict `.dockerignore` (§5); a missing one ships `data/` + `.env` into the
  daemon and can leak them into a layer.
- **`ports:` on orbweaver** — reopens the Host-spoof owner-fallback (spec §4). `expose:` only.
- **Shell-form ENTRYPOINT/CMD** — forks `/bin/sh -c`, which swallows SIGTERM; use exec-form JSON
  arrays so signals reach node (and pair with `--init`).
- **Distroless/Alpine for this app** — spec Fork A rejects both (shell needed; musl+native-binding
  risk). Debian slim.
- **Rebuilding the client at runtime** — it's a baked immutable artifact; build once in Stage 2.
- **A single mega-`RUN`** that mixes apt + npm + build — splits poorly for cache; but do keep each
  apt-install self-contained (update+install+clean in one RUN).

---

## Sources

Official-first, recent (2024–2026):

- [Docker docs — Build secrets](https://docs.docker.com/build/building/secrets/)
- [Docker docs — Dockerfile reference (RUN --mount, HEALTHCHECK, STOPSIGNAL, USER, EXPOSE, LABEL, COPY --link/--chown)](https://docs.docker.com/reference/dockerfile/)
- [Docker docs — Compose file: services (expose, healthcheck, depends_on, env_file, secrets, shm_size)](https://docs.docker.com/reference/compose-file/services/)
- [Docker docs — Run Compose services with GPU access](https://docs.docker.com/compose/how-tos/gpu-support/)
- [Docker docs — GPU access (engine, --gpus)](https://docs.docker.com/engine/containers/gpu/)
- [Docker docs — buildx build (attestations, --sbom, --provenance)](https://docs.docker.com/reference/cli/docker/buildx/build/)
- [Docker blog — SBOM generation for container workflows](https://www.docker.com/blog/sbom-generation-for-container-workflows/)
- [pnpm docs — deploy (inject-workspace-packages / --legacy / --prod)](https://pnpm.io/cli/deploy)
- [pnpm docs — Working with Docker (cache mounts, deploy in a build stage)](https://pnpm.io/docker)
- [pnpm discussion #4777 — Docker multistage builds with a pnpm monorepo](https://github.com/orgs/pnpm/discussions/4777)
- [nodejs/docker-node — official node images (26 bookworm-slim)](https://github.com/nodejs/docker-node)
- [node — Official Image | Docker Hub (tags)](https://hub.docker.com/_/node)
- [NVIDIA NGC — CUDA container images (runtime/base/devel, ubuntu24.04/26.04 tags)](https://catalog.ngc.nvidia.com/orgs/nvidia/containers/cuda)
- [NVIDIA — Container Toolkit / Docker specialized configs](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)
- [nodejs/docker-node #1620 — PID 1 / signal handling guidance](https://github.com/nodejs/docker-node/issues/1620)
- [Compose Tip #43 — Read-only root filesystems (read_only + tmpfs + cap_drop + no-new-privileges)](https://lours.me/posts/compose-tip-043-read-only-rootfs/)
- [Compose Tip #10 — init: true for PID 1](https://lours.me/posts/compose-tip-010-init-pid1/)
- [BellSoft — Docker image security best practices: SBOM, non-root, provenance](https://bell-sw.com/blog/docker-image-security-best-practices-for-production/)
- [OneUptime — Multi-stage Dockerfiles for monorepos (2026-01)](https://oneuptime.com/blog/post/2026-01-30-docker-multi-stage-monorepos/view)
- [OneUptime — RUN --mount=type=secret for build-time secrets (2026-02)](https://oneuptime.com/blog/post/2026-02-08-how-to-use-run-mounttypesecret-for-build-time-secrets/view) </content>

</invoke>
