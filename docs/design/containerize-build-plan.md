---
kind: design
status: active
updated: 2026-08-14
---

# Containerize — build plan (the forge lane's phase-1 artifact)

> Executes [`containerize-prod-image-spec.md`](containerize-prod-image-spec.md) (WHAT) using
> [`docker-modern-practices-research.md`](docker-modern-practices-research.md) (HOW). This file holds the
> three artifact-structure decisions the build brief left open, the premise repairs found re-deriving the
> spec against today's tree, the coupled-site inventory, and the test plan. Every claim carries its
> receipt; §5 names what CANNOT be verified in this lane (no docker build / no GPU / no live fleet).

## 1. Decisions (each with the rejected arm)

### 1.1 ONE Dockerfile, two build TARGETS — not two Dockerfiles

`Dockerfile` with stages `deps → build → runtime-slim` (profile 2) and `deps → build → gpu-base →
runtime-gpu` (profile 1); select with `docker build --target runtime-{slim,gpu}` / compose
`build.target`. The deps/build stages are byte-shared, so the two profiles cannot drift on install,
tokens:build, client build, or the `pnpm deploy` prune — the exact one-home property this repo enforces
everywhere else. BuildKit builds only the stages a target needs, so the slim build never touches CUDA.
**Rejected: two Dockerfiles** — duplicates the four shared stages; every future dependency/build change
becomes a two-file edit with silent-drift failure mode, for zero capability gain.

### 1.2 ONE `docker-compose.yaml` with `profiles:` — not two files, not `-f` overlays

Three compose profiles — `all-in-one` (orb + baked fleet, GPU), `slim` (app only, engines off/external
URL), `sibling` (slim app + a `vllm/vllm-openai` sibling service) — over three app-service declarations
sharing a YAML anchor and ONE network alias `orbweaver` (a front proxy targets `orbweaver:8788`
regardless of variant). Volumes/secrets/network blocks are declared once. Picking a profile picks the
CORRECT engine env (`ENGINES_POSTURE`, `VLLM_ENGINE_HOST`) — a stranger cannot mis-pair variant and
engine posture, which is the spec's secure-default thesis applied to engines. **Rejected: two compose
files** (duplicated secrets/volumes, drift) and **`-f` overlays** (overlays are for env-specific tweaks
of one topology; profiles are the purpose-built lever for alternative service sets in one file).

### 1.3 Secret indirection: an ENTRYPOINT SHIM reading `*_FILE` — not `env_file`-only, not an env-schema change

**Checked: the env schema has NO `*_FILE` support** — every key reads `process.env` directly, parsed
once and frozen at module load (`packages/server/src/foundation/env/index.ts:148-409`; no `_FILE` token
anywhere in the file). The brief's fork is therefore live, and the pick is `docker/entrypoint.sh`: for a
fixed allowlist (`SESSION_SECRET OIDC_CLIENT_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD
OPENROUTER_API_KEY DEBUG_TOKEN`), if `<VAR>` is unset and `<VAR>_FILE` names a readable file, export the
file's contents as `<VAR>`, then `exec "$@"`. Compose mounts file `secrets:` at `/run/secrets/*` and
sets only the `*_FILE` paths in service env. An EMPTY secret file is treated as unset (this is what lets
the shipped placeholder files boot `single-user` with zero configuration); a pointed-at-but-unreadable
file is a loud exit 1. **Rejected: tight-perms `env_file` alone** — secret VALUES land in the container
config and read back out of `docker inspect`; the research names the file-secret path stronger.
**Rejected: adding `*_FILE` support to the env schema** — it is the strongest arm long-term, but it is
server-foundation surgery on the one `process.env` reader, outside this lane's scoped code changes
(brief enumerates exactly: `VLLM_ENGINE_HOST` + the GPU-detect gate); the shim delivers the identical
runtime posture from the docker layer. Flagged as a possible future owner call, not built here.

### 1.4 Runtime image layout: WORKSPACE-shaped sources + HOISTED `pnpm deploy` node\_modules + `@orb` symlinks

`pnpm --filter @orb/server deploy --legacy --prod --config.node-linker=hoisted` produces the pruned
runtime `node_modules` (221 packages vs the workspace's 1129). The image carries THAT at
`/app/node_modules`, keeps ALL FOUR `@orb` package SOURCES workspace-shaped
(`/app/packages/{kit,contracts,db,server}/{package.json,src}` + `/app/packages/client/dist`), and
replaces the deploy output's copied `@orb/*` dirs with SYMLINKS to those tree sources.
`CMD ["node","packages/server/src/entry/index.ts"]`.

**Why every piece is load-bearing (the first boot attempt REFUTED the naive shape — receipts §5):**

- **The symlinks:** node 26 hard-refuses type-stripping for real files under `node_modules`
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` — the naive "copy deploy node\_modules as-is" layout
  died on it at first boot). The dev workspace passes the same check ONLY because workspace packages are
  symlinks whose realpath is outside `node_modules` — the image reproduces exactly that shape.
- **The hoisted linker:** once `@orb/db` runs from `/app/packages/db`, its own deps (`@libsql/client`,
  `drizzle-orm`, …) must resolve by upward walk to `/app/node_modules/<dep>` — the hoisted layout puts
  the whole transitive set flat at top level; pnpm's default isolated layout does not.
- **The workspace shape:** `CLIENT_DIST_DIR` defaults to `./packages/client/dist`
  (`foundation/env/index.ts:191`), the spec's own §2 CMD is the workspace path, and profile 1's fleet
  spawn runs `bash <cwd>/scripts/dev/engines.sh start` (`supervisor.ts:246`, repoRoot =
  `process.cwd()` per `lifecycle.ts:222`).
- `#*` subpath imports resolve via each package's own `package.json` (`imports: {"#*":
  "./src/*/index.ts"}`); migrations ride inside the tree `@orb/db` (`packages/db/src/migrations`,
  resolved cwd-independently through the symlink via `createRequire` — `entry/boot/migrate.ts:17-20`).

**Proven in-lane by a host-side boot of the exact layout (§5).**

## 2. Premise repairs — where the spec/research died on today's tree

1. **CUDA is 13.0, not the research's assumed 12.x.** The live venv: vLLM `0.22.1`, torch
   `2.11.0+cu130`, `torch.version.cuda == 13.0` (read from `.cache/vllm/venv`, this box). GPU base is
   therefore `nvidia/cuda:13.0.2-runtime-ubuntu24.04` — digest resolved live (§4). `vllm-setup.sh:37`
   pins `vllm>=0.22,<0.23`; its `--torch-backend=auto` inspects the DRIVER, which a build container does
   not have, so the image pins `--torch-backend=cu130` (the measured live backend) instead of `auto`.
2. **Three container coupled-sites the spec never enumerated, all in the profile-1 spawn path:**
   - `engines.sh:33` hardcodes `TSX="$REPO/node_modules/.bin/tsx"` — tsx is a ROOT devDependency, absent
     from a pruned prod `node_modules`. Fix (in-lane, dev-behavior-identical): fall back to `node` when
     the tsx binary is absent (node 26 runs `.ts` source; the same mechanism the server itself uses).
   - `scripts/dev/engines.ts:32-44` + `engines-ctl.ts:18-34` import `@orb/server/...` BY PACKAGE NAME —
     `pnpm deploy` output contains the server's deps but not `@orb/server` itself. Fix: the gpu image
     adds `node_modules/@orb/server -> ../../packages/server` (one symlink; the package's exports map
     `"./*": "./src/*/index.ts"` then resolves both scripts).
   - `build-argv.ts:152-153` references `scripts/dev/qwen3_vl_{embedding,reranker}_serve.jinja` relative
     to repoRoot — the gpu image must carry the two templates (plus `engines.sh/engines.ts/
     engines-ctl.ts/vllm-setup.sh`; the rest of `scripts/dev` stays out).
   - Related env arrangement (no code change): `engines.sh:79` checks the venv at
     `$VLLM_STORE_ROOT/.cache/vllm/venv` and IGNORES `VLLM_BIN` — so the image bakes the venv exactly
     there (`VLLM_STORE_ROOT=/opt/vllm-store`) and relocates the model/compile caches onto the volume
     via explicit `HF_HOME=/models/hf` + `VLLM_CACHE_ROOT=/models/vllm-cache`, keeping the baked venv
     out of the volume mount's shadow.
3. **The GPU-detect fix needs TWO sites, not the spec's one.** Gating `lifecycle.ts:201-203` alone still
   leaves `supervisor.ts:291`'s unconditional `if (!detectGpu())` idling the supervisor on a GPU-less
   box ("no GPU on this host", all engines down) — D2 external-engine would register the backend and
   then never probe/adopt. Both sites gate the local-GPU requirement on the MANAGING posture. The
   lifecycle formula is extracted to `effectiveVllmDisabled(posture, gpuPresent)` in
   `foundation/env/posture.ts` (pure, truth-table-testable; the inline boot expression was untestable).
4. **`pnpm install` in a git-less build stage fails**: the root `prepare` script is `lefthook install`,
   which hard-exits 128→1 outside a git repo (probed on this box; `LEFTHOOK=0` does NOT rescue it). The
   deps stage runs `git init .` before install (git ships in `node:26-bookworm`; the throwaway `.git`
   never reaches a runtime stage). `--ignore-scripts` was rejected — it would also skip the
   `allowBuilds` postinstalls (`sharp`, `onnxruntime-node`, `@openrouter/sdk`; `pnpm-workspace.yaml`).
5. **node 26 refuses to type-strip under `node_modules`** — `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`
   killed the first boot of the naive deploy layout (real `@orb/*` source dirs inside `node_modules`).
   Neither the spec (A4 worried about SYNTAX — enum/namespace) nor the research anticipated the PATH
   restriction. The fix is §1.4's hoisted-deploy + tree-sources + symlinks shape; the second boot passed
   end to end. This is why the boot proof exists.
6. **The spec §6 sketch (`depends_on: caddy`) is not expressible here** — Caddy lives in the stack
   repo's separate compose project. This repo's compose is self-contained (own network + `orbweaver`
   alias); the owner's Caddy integration is a documented external-network stanza + the
   `reverse_proxy orbweaver:8788` repoint, not a dependency edge. The brief's "depends\_on conditions"
   lands on the sibling profile: app → vllm `condition: service_started` (deliberately NOT
   `service_healthy` — the adopt-only supervisor's whole design is poll-and-adopt, and a cold engine
   takes minutes the app should spend serving auth/UI).
7. **The sibling variant serves the GEN engine only.** Engines bind loopback by construction
   (`build-argv.ts:155` + `--host` at 180/202/259), so OUR launcher cannot serve a sibling container —
   the sibling is the upstream `vllm/vllm-openai:v0.22.1` image (version = the venv pin, digest §4) on
   port 8703. embed/rerank probe down and the app absence-degrades (the posture doc's honest fail-fast);
   a deployer wanting the full local trio runs profile `all-in-one`.

## 3. Code changes + test plan (all red-first against the pre-change source)

| Change | Site | Test (suite, red-first mechanism) |
| - | - | - |
| `VLLM_ENGINE_HOST` env key, default `127.0.0.1`, host-only | `foundation/env/index.ts` (beside the port floor) | covered via the two consumers below |
| `engineBaseUrl` reads the host | `infra/providers/vllm/engine/engine-url.ts:17-20` | `tests/server/infra/providers/vllm/engine/engine-url.test.ts` — new re-import describe (the `reimportEnvWith` house pattern from `tests/server/foundation/env/index.test.ts:45-69`); red on old source (URL stays loopback). Stale test 3 ("never a routable host") truth-repaired to a default-env pin. |
| `internalBackendHostPorts` keys off the host | `infra/network/egress.ts:81-83` | `tests/server/infra/network/egress.int.test.ts` — new describe: relocated host `127.0.0.2` ⇒ `127.0.0.2:8701` passes, `127.0.0.2:9998` blocked, `127.0.0.1:8701` blocked (the set READS env, never accumulates). Red on old source (first arm SSRF\_BLOCKED). |
| `effectiveVllmDisabled(posture, gpuPresent)` | `foundation/env/posture.ts` (new pure fn) + `entry/lifecycle.ts:201-203` uses it | `tests/server/foundation/env/posture.test.ts` — 6-row truth table; red via a cp-scratch of posture.ts carrying the OLD formula (`!(registers && gpu)`) — the `adopt-only × no-GPU` row flips. |
| Supervisor idle-gate manages-scoped | `infra/providers/vllm/engine/supervisor.ts:291` | `tests/server/infra/providers/vllm/engine/supervisor.test.ts` — harness gains a `gpuAbsent` switch on the existing `execFileSync` mock; adopt-only × no-GPU must NOT idle (statuses probe-driven), manager × no-GPU still idles. Red on old source (adopt-only arm reads "no GPU on this host"). |
| `engines.sh` tsx→node fallback | `scripts/dev/engines.sh:33` | dev tooling (constitution's KISS carve-out); shellcheck + unchanged-dev-path reasoning; no vitest suite exists for the shim |

Shared-value sweep: `VLLM_ENGINE_HOST` has zero pre-existing test references; the default keeps every
`127.0.0.1` assertion true — proven by running the WHOLE engine suite dir + the egress/env/posture/
lifecycle suites cold, plus a repo-wide grep of `127.0.0.1:87` / `no GPU on this host` across `tests/`.

## 4. Artifact inventory (authored by this lane)

- `Dockerfile` — targets `runtime-slim` / `runtime-gpu`; `# syntax=docker/dockerfile:1`; pnpm-store
  cache mount with `store-dir` pinned to the mount target; manifests-before-source; `COPY --link`;
  `pnpm --filter @orb/server deploy --legacy --prod`; non-root `node` (the CUDA/ubuntu24.04 stage must
  first drop the default `ubuntu` uid-1000 user); HF token ONLY via `--mount=type=secret,id=hf_token`
  inside the optional `BAKE_MODELS` arm; digests pinned from live registry reads this session:
  - `node:26-bookworm@sha256:0353e48e0e8a993db87b720c242f54b207059d1bcc0106534896e8a11054c837`
  - `node:26-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341`
  - `nvidia/cuda:13.0.2-runtime-ubuntu24.04@sha256:6a0e31b59e70890446f2c17356d6efc0d54260090a8c63d6ca7c2ad049db95d2`
  - `vllm/vllm-openai:v0.22.1@sha256:953d3a06d5e64ab582985cd7401289d3abf2a2c14ef2158e9a84313daeec77d7`
- `.dockerignore` — `.git`, `.env*`, `data/`, `node_modules` (all), `packages/client/dist`, `tests/`,
  `docs/`, `reports/`, `.cache`, `.claude/` (worktrees included), `.devcontainer`, `.stryker-tmp`, logs.
- `docker-compose.yaml` — three profiles (§1.2); `expose:` never `ports:` (AUTHFIX-2 §4 primary
  control); file `secrets:` at `/run/secrets/*` + `*_FILE` env; `init: true`; `cap_drop: [ALL]` +
  `no-new-privileges` everywhere; `read_only: true` + `tmpfs: [/tmp]` on the slim/sibling app (NOT on
  all-in-one — HF/vLLM writes); GPU reservation via `deploy.resources.reservations.devices` +
  `shm_size: 8gb` + `start_period: 300s` on the GPU-bearing service of each profile; commented
  loopback-publish and external-network (Caddy) stanzas with the §4 warnings.
- `docker/entrypoint.sh` (§1.3), `docker/orbweaver.env` (shipped secure defaults: `AUTH_MODE=
  single-user`, `AUTH_FALLBACK=deny`, `WIRE_CAPTURE/RPG_TRACE=off`, `DEBUG_TOKEN` unset + per-mode
  commented blocks from spec §3), `docker/secrets/*` (5 empty placeholders + README), `docker/README.md`
  (the §3 auth-matrix quick table + run lines per profile).

## 5. Verified in-lane vs deferred to the owner's live-infra step

**In-lane proofs:** the §3 suites cold; the three typecheck programs + biome/eslint on touched files +
`check:structure` + knip; `shellcheck` on both shell artifacts; `docker compose config` per profile;
`docker build --check` (BuildKit lint, no build) per target; **Fork E prove-by-boot executed on the
HOST**: real `pnpm deploy --legacy --prod` output + client dist assembled into the §1.4 layout in
scratch, `NODE_ENV=production` boot on a free port, `/healthz` 200, SIGTERM clean drain — proving the
pruned node\_modules + workspace-shaped sources + migrations + SPA serve + node-26-runs-TS end to end
(spec A4/Fork E), and `node scripts/dev/engines-ctl.ts status` under the same layout proving the
`@orb/*` symlinks + node-runs-scripts arm (it read the live fleet + both GPUs correctly).

**NOT verifiable here (owner's sequenced live step):** the actual `docker build` of both targets (GPU
image needs the CUDA/vLLM download + a GPU host), container runs, the vLLM fleet spawning inside the
namespace, read-only-rootfs shakeout on the slim profile, h3/Alt-Svc at Caddy, and the §4/Fork F pentest
cage (Host-spoof owner-fallback, unsigned forward-header peer gate, debug-gate across modes) — the spec
routes the cage to a separate adversarial lane against a RUNNING container. Possible first-build
surprises named now: an apt lib vLLM wants that bare-metal happened to have (fix: add to the gpu stage),
and the exact `vllm/vllm-openai` serve flags for Qwen3-VL (the sibling command is marked for live tune).
