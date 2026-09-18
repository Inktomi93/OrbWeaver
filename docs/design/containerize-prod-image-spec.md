---
kind: design
status: draft
updated: 2026-09-18
---

# Production container image + deployment spec (all auth modes)

> **STATUS 2026-09-18 — PARTIALLY SUPERSEDED by the shipped container surface (owner ruling, 2026-09-18).** The
> two-profile image (§2 Profile 1 all-in-one GPU + the vLLM sibling) is RETIRED: ONE app-only image ships
> (`Dockerfile` target `runtime`, `docker-compose.yaml` ONE service), and local engines are the deployer's own
> server in every setup (`ENGINES_POSTURE=adopt-only` + `VLLM_ENGINE_HOST`, identical bare-metal and in a
> container) — the owner does not maintain two vLLM setups. §3.1's OWNER FORK on the container default is
> resolved at the compose layer for now: the shipped default is `AUTH_MODE=local` with a generated first-boot
> password (`docker/entrypoint.sh`), and `single-user` works only via host networking
> (`docker/compose.host-network.yaml`) because a bridge-published port never delivers a loopback peer (verified
> in a running container 2026-09-18: bridge + single-user 401s, host-network + single-user mints owner). A
> trusted-peer opt-in (§3.1 arm b) is proposed on a lane branch and awaits the owner's word. The user-facing
> guide is `docker/README.md`; §3/§4's mode matrix and trust model remain the law for the app's behavior.

> DESIGN-ONLY. No code was touched, no stack run. This spec is read against TODAY's tree; every
> load-bearing claim carries a `path:line` receipt. A build lane follows once the owner rules §7.
>
> **RE-ATTESTED 2026-08-19 (lane doc-reattest, after #298 f2 / #300 / #301 landed at `6ef448dd6`).** The
> auth/env/engine receipts were re-derived against merged `main` and repaired in place; every repair is
> marked inline. Three claims died on the tree and are corrected where they stood: single-user's fallback
> is NOT unconditional (§3.1), `LOCAL_INITIAL_PASSWORD` is NOT boot-fatal (§3.2), and the D2 external-engine
> code changes are already BUILT (§3.6). The `Host`-spoof exploit narrative in §4/§7/§8 is obsolete by
> design change, not by mitigation.
>
> **The thesis (owner framing):** ship one image a *stranger* can deploy under ANY of the four auth
> modes and get a SECURE default without reading the source. "Works for everyone" fails the moment one
> mode has an insecure default. The security core is §3 (the auth matrix) and §4 (the container trust
> model / AUTHFIX-2 chain) — the Dockerfile in §2 is the easy part.

## 0. Starting facts — verified against the tree

| Claim (from prior recon) | Verdict | Receipt |
| - | - | - |
| No prod app Dockerfile exists | **TRUE** | `find -iname Dockerfile` → only `.devcontainer/Dockerfile` (+ worktree copies) and the SillyTavern-goldens probe image. None builds the app. |
| `.devcontainer/Dockerfile` is a Claude-Code dev sandbox, not a prod image | **TRUE** | It bakes claude-code, zsh, playwright chromium, git-delta, a firewall script; runs as `node`, no app build, no `CMD` (`.devcontainer/Dockerfile:1-127`). Usable as a *toolchain reference* (node:26 + corepack pnpm) only. |
| App runs bare on host; Caddy proxies `orbweaver.inktomi.tech` → `host.docker.internal:8788` | **TRUE** | `caddy/conf/Caddyfile:370-392` (stack repo, `/home/inktomi/inktomi-stack/caddy/conf/Caddyfile`). |
| The `host.docker.internal` mapping is flagged for removal | **TRUE, but the note is about neo-tavern** | `docker-compose.yaml:148-150` (`extra_hosts: host.docker.internal:host-gateway` — "drop this once neo-tavern moves into the compose network"). The Orbweaver block reuses the same relic. |
| Live `.env` is `AUTH_MODE=oidc` | **TRUE** | `.env` (redacted read); also carries live `DEBUG_TOKEN`/`WIRE_CAPTURE`/`RPG_TRACE` that MUST NOT be baked into a shipped image (§5). |

**Two facts the recon did not mention that reshape the image (see §7 forks D & E):**

1. **The server is NOT compiled — node 26 runs `.ts` directly.** The production spawn is
   `NODE_ENV=production node packages/server/src/entry/index.ts`, built at one site
   (`tooling/src/stack/lib/spawn-plan.ts`) and run detached by `pnpm stack up prod` or in the foreground by
   `pnpm stack start-fg prod` — the pair that replaced the removed `pnpm start` script (#309);
   `engines.node >= 26`, `packageManager pnpm@11.15.1`. The only build artifact is the client bundle
   (`vite build` → `packages/client/dist`,
   `packages/client/package.json` `build`). So "build" = install deps + `pnpm --filter @orb/client build`;
   the server ships as source `.ts` + its workspace deps (`kit`/`contracts`/`db`) as source.
2. **The canonical deployment bakes orb AND the 3-engine vLLM fleet into ONE container** (owner's turnkey
   profile). The engine is reached over loopback BY DEFAULT: `engineBaseUrl` builds
   `http://${VLLM_ENGINE_HOST}:${PORTS[engine]}` at ONE site
   (`infra/providers/vllm/engine/engine-url.ts:23-25`, default host `127.0.0.1` — `env:298`) and the egress
   bypass reads the SAME env host (`infra/network/egress.ts:83-86`); the spawn path already anticipates a
   Docker image supplying the vLLM binary — "Bare-metal dev uses the repo venv; **the Docker image sets
   vllmBin**" (`infra/providers/vllm/engine/spawn-engine.ts:58-60`, via `VLLM_BIN`/`VLLM_PY`/`HF_HOME`). In
   the all-in-one container `127.0.0.1` is literally correct and the GPU is passed to THE container, so none
   of the "reach a remote engine" plumbing bites the owner's profile (§3.6 confirms this against the code).
   The `VLLM_ENGINE_HOST` env lever is retained only for the SLIM profile's external-engine arm; it defaults
   to `127.0.0.1` at zero cost for the all-in-one. This is why one codebase serves both the turnkey GPU box
   and cloud/CPU deployers (§2 two-profile structure + Fork D).

## 1. The four auth modes (the enumeration)

`AUTH_MODES = ["single-user", "local", "forward-header", "oidc"]`
(`packages/contracts/src/identity/index.ts:28`). Dispatch is exhaustive over this union
(`infra/auth/dispatch.ts:38-43`, `MODE_RESOLVERS`); a fifth mode fails `tsc`. Config is parsed once from
env and frozen (`foundation/env/index.ts:611`), with a boot-fatal `superRefine` (`:501-607`) that refuses
a misconfigured `oidc`/`local`/`OWNER_HANDLES` deploy — and, since #298/#301, a prod SSO deploy carrying
the owner fallback or an `AUTH_FALLBACK` pinned in `.env` (`:523`, `:560`, `:575`) — at module load, so a
misconfigured box never silently degrades to owner-on-the-public-FQDN.

The identity pipeline is three tiers, and the split matters for what the container must get right:

- **VERIFICATION** (`infra/auth`, db-free, sealed): headers + the raw TCP peer → pre-row `ResolvedIdentity` +
  the peer-gated owner-fallback discriminant. No role, no userId, no upsert (`infra/auth/index.ts`).
- **RESOLUTION** (`domain/sessions`): role policy + users-row upsert.
- **CONSTRUCTION** (`entry/auth/seam.ts`): the ONE `Principal` mint.

## 2. The production image — TWO profiles from one codebase (the load-bearing packaging decision)

"Designing for everyone" and "the owner's turnkey GPU box" are not one image — they are two build targets
that share all app code and differ only in whether the vLLM fleet is baked in:

| | **Profile 1 — all-in-one (DEFAULT)** | **Profile 2 — slim app-only** |
| - | - | - |
| Contents | orb + the 3 vLLM engines + CUDA + models | orb only |
| For | the owner + any GPU self-hoster who wants turnkey | cloud-only / CPU-only / GPU-less deployers |
| `ENGINES_POSTURE` | `adopt-or-start` (the container spawns the fleet) | `off` (D3) or `adopt-only` + external URL (D2) |
| `VLLM_ENGINE_HOST` | `127.0.0.1` (default — fleet shares the namespace) | unset (off) or the external engine host |
| GPU | MANDATORY (`--gpus all`; ~34 GiB VRAM/card, 2×A6000 class) | none |
| Image size | HUGE (CUDA + vLLM + model weights, many GB) | small (node + app + client dist) |
| Base image | an NVIDIA CUDA runtime base + node 26 | `node:26-slim` |

**The honest tradeoff:** the all-in-one is the OPPOSITE of universal — GPU-mandatory and multi-GB — which is
exactly why it cannot be the *only* image. Profile 1 is the owner's default because it is turnkey (`docker run --gpus all` and the whole stack, engines included, comes up). Profile 2 is the documented alternative that
keeps the "everyone" contract: a cloud/CPU deployer gets a small image that runs cloud models (OpenRouter /
agent-sdk) or points at an external engine. The `VLLM_ENGINE_HOST` env lever (§3.6) is what lets ONE codebase
serve both — it defaults to `127.0.0.1` for profile 1 at zero cost and is the external-engine pointer for
profile 2. The auth matrix (§3.1-3.5) and the container trust model (§4) are IDENTICAL across both profiles;
only engine packaging differs.

The rest of this section specifies the SLIM runtime (profile 2 / the shared app layer); §3.6 specifies how
profile 1 bakes the fleet on top of it.

**Base:** `node:26` in the builder, `node:26-slim` (Debian) at runtime for profile 2 — matches the toolchain
the devcontainer already proves (`FROM node:26`, `corepack enable`) and the `>=26` engines pin. Do NOT use
Alpine: node 26's native TS type-stripping + libSQL's native bindings (`@libsql/client`) are lower-risk on
glibc than musl, and the devcontainer's proven path is Debian. Profile 1 swaps the runtime base for an NVIDIA
CUDA runtime image with node 26 layered on (Fork A: base image, now per-profile).

**Multi-stage (slim / shared app layer):**

```
# ---- Stage 1: builder (node:26) ----
#  - corepack enable && corepack prepare pnpm@11.15.1 --activate   (the pinned pm, NOT devcontainer's 11.5.1)
#  - copy pnpm-workspace.yaml, pnpm-lock.yaml, package.json, packages/*/package.json
#  - pnpm install --frozen-lockfile                                (full, for the client build)
#  - copy the rest of the source
#  - pnpm --filter @orb/ui tokens:build   (theme.css + tokens/index.ts are GENERATED — a dead token is a build error)
#  - pnpm --filter @orb/client build      (→ packages/client/dist)
#
# ---- Stage 2: runtime (node:26-slim) ----
#  - non-root user `node` (the base image already ships uid 1000 `node`)
#  - copy: server/kit/contracts/db SOURCE (.ts) + drizzle migration SQL, the client dist, and a
#    PRODUCTION node_modules (see fork E — pnpm deploy vs pruned install)
#  - WORKDIR /app ; ENV NODE_ENV=production
#  - USER node
#  - EXPOSE 8788   (expose only — DO NOT publish; see §4)
#  - HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
#  - CMD ["node","packages/server/src/entry/index.ts"]
```

**Non-negotiables baked into the image design:**

- **Non-root** (`USER node`). The app needs write only to the data volume; own that path to `node:node`.
- **`data/` is a MOUNTED VOLUME, never baked.** All state is cwd-relative under `./data`:
  `DATABASE_URL=file:./data/orbweaver.db` (+ `-wal`/`-shm`), `ASSETS_DIR=./data/assets` (CAS blobs),
  and the variants dir derived as `dirname(ASSETS_DIR)/variants` = `./data/variants`
  (`entry/lifecycle.ts:248`, `foundation/env/index.ts:277,282`). Mount one volume at `/app/data`. Boot runs
  `runBootMigrations` (`entry/lifecycle.ts:179`), so a fresh volume self-migrates.
- **Client dist IS baked** (`CLIENT_DIST_DIR=./packages/client/dist`, prod-boot-fatal if missing —
  `foundation/env/index.ts:279-280`, `entry/app.ts:341`). It is an immutable build artifact, not state.
- **Secrets via env / mounted secret files, NEVER layers.** No `ENV SESSION_SECRET=…`, no `.env` copied in
  (`.gitignore` already excludes it; the Dockerfile must `.dockerignore` it too). The `.env` loader is a
  silent no-op when the file is absent (`foundation/env/index.ts:160-182`), so env-var injection is the
  supported prod path — the schema reads `process.env` directly.
- **`.dockerignore`:** `.env`, `data/`, `node_modules`, `.git`, `packages/client/dist` (rebuilt),
  `.claude/`, `reports/`, `.cache/`, `.stryker-tmp/`, `tests/`, `.devcontainer/`.
- **Toolchain copied from the devcontainer where sound:** `FROM node:26` + `corepack` + the pinned pnpm.
  **What MUST differ for prod:** drop claude-code, zsh/p10k, playwright + its chromium (huge), git-delta,
  the iptables firewall script, `sudo`, `DEVCONTAINER=true`, the per-package `node_modules` volume seeding
  — all dev-only. The runtime stage carries no dev tooling and no test tree.

## 3. THE AUTH-MODE MATRIX (the load-bearing deliverable)

For each mode: required env/secrets, container run posture, and the fallback/debug posture. **The
invariant across all four: a stranger who picks the mode and sets nothing exotic gets a SECURE default.**

### 3.1 `single-user` (default, `AUTH_MODE` schema default — `foundation/env/index.ts:394`)

- **What it is:** no SSO, no cookies, no headers. The mode resolver always returns `null`
  (`infra/auth/modes/single-user.ts:13`) and the request resolves to the owner via the owner fallback —
  which since #298 f2 is **LOOPBACK-PEER-GATED like every other mode** (`dispatch.ts:52-54`,
  `ownerFallbackAllowed`). **REPAIRED 2026-08-19:** this section previously said the fallback was
  "unconditional" for `single-user`; that was true of the pre-#298-f2 Host gate and is false on today's
  tree. A single-user request from a NON-loopback peer resolves nobody and 401s.
- **Env/secrets:** none required; `SESSION_SECRET` not required. **`AUTH_FALLBACK` must be `owner`** — it
  is NOT irrelevant here (a correction; see §4). `resolve` tests `fallback === "owner"` BEFORE the peer gate
  (`infra/auth/index.ts:53`), so `single-user` + `deny` authenticates nobody and 401s every request. The
  pair is boot-fatal (`foundation/env/index.ts:523`); the working pair is the ruled default below.
- **Container posture — REWRITTEN FOR THE PEER GATE (the old "any request that reaches the port is the
  owner" warning is obsolete):** the network-reachability warning has INVERTED into a usability problem.
  A published container port never delivers a loopback peer — docker's port publication arrives from the
  bridge gateway (`172.17.0.1`-class), and a fronting proxy in its own container arrives as the bridge
  address too — so `docker run -p 8788:8788` + `single-user` authenticates NOBODY and 401s every browser
  request. The only loopback peers in a containerized single-user deploy are processes INSIDE that
  container, and a SAME-HOST proxy that forwards over `127.0.0.1` (which re-opens the world-owner shape,
  §4). **Consequence for the RULED DEFAULT (§4.2, owner 2026-08-08 — "the image ships single-user +
  `AUTH_FALLBACK=owner` so a stranger's first run is usable-as-owner with no setup"): that default no
  longer delivers a usable first run in a container.** This is now an OWNER FORK, not a settled default —
  the plausible arms are (a) ship `local` mode as the image default (first-run password setup is itself
  loopback-peer-gated, `auth-routes.ts:247-249`, so it needs `LOCAL_INITIAL_PASSWORD` in a container), or
  (b) an explicit, documented, non-default env opt-in that widens the fallback's peer set for a deployer
  who accepts the risk. The build lane MUST verify the observed peer inside the container before closing
  this; do not assume.
- **Debug gate:** the owner fallback is `via:"fallback"`, which `debugGateCredentialed().fallback` admits
  ONLY on a non-production box (`entry/auth/seam.ts`; the rule is
  `foundation/env::resolveOwnerFallbackCredential`, `NODE_ENV !== "production" && AUTH_FALLBACK === "owner"`).
  **In a PRODUCTION image — which is every image this spec describes, since both prod launchers export
  `NODE_ENV=production` — `/api/_debug/*` is still NEVER open to the un-credentialed caller, single-user
  included.** It requires `DEBUG_TOKEN` (default unset → 404). Correct. The amendment (#1193, 2026-09-02)
  exists because the same absolute had closed the door on the DEV stack against the owner's own session,
  which is the only session a dev box has; it deliberately stops at the production boundary because a
  same-host proxy makes every external request a loopback peer, and this surface holds more than the app
  does (raw provider request bodies with `WIRE_CAPTURE=on`).

### 3.2 `local` (app-stored username+password, cookie/BFF sessions)

- **Required env (boot-fatal if missing — `foundation/env/index.ts:216-225`, `AUTH_MODE_REQUIRED_ENV`):**
  `SESSION_SECRET` (≥32 chars, HMAC-peppers the token hash) and NOTHING ELSE. **REPAIRED 2026-08-19:**
  this section (and the §3.5 row) listed `LOCAL_INITIAL_PASSWORD` as boot-fatal; it has been OPTIONAL
  since B4 (`:413`, `.optional()`) — a fresh local box seeds the owner row with a NULL password and the
  in-app first-run setup (`POST /api/auth/first-run`) claims it. **But that first-run route is itself
  LOOPBACK-PEER-gated** (`auth-routes.ts:247-249`, the same `ownerFallbackAllowed`), so in a container it
  is unreachable from the browser — **for a CONTAINERIZED local deploy `LOCAL_INITIAL_PASSWORD` is
  effectively required** (≥8 chars; `seed-owner.ts:14-19,101`, first-boot-only, never clobbers a rotated
  password). Set it in the image's deploy docs as required-in-practice, not optional.
- **Cookie:** `__Host-orb_session`, `Secure; HttpOnly; SameSite=Lax; Path=/` (`auth-routes.ts:45-46,161`).
  **`__Host-`/`Secure` REQUIRE HTTPS at the browser edge.** Behind a TLS-terminating proxy the app writes
  `Secure` over plain HTTP and the browser (talking HTTPS to Caddy) stores/sends it — works. **A stranger
  who runs local mode on plain HTTP silently cannot log in** (the browser drops the Secure cookie). Deploy
  note: local mode MUST be fronted by HTTPS. No code change; document it.
- **Owner fallback:** the fallback is loopback-peer-gated in this SSO-class mode (see §4), and prod REFUSES
  TO BOOT with `AUTH_FALLBACK=owner` — set `AUTH_FALLBACK=deny` for any public multi-user local deploy.
- **Container posture:** set `SESSION_SECRET` + `LOCAL_INITIAL_PASSWORD` via secrets; multi-user is a runtime
  admin setting (`localMultiUser` → `MULTI_HUMAN_CAPABLE.local`, `entry/app.ts:154-156`), not env.
- **Debug gate:** an admin/owner session cookie passes (`debugGateCredentialed().cookie = true`), else
  `DEBUG_TOKEN`.

### 3.3 `oidc` (the app is an OIDC client — the owner's live mode, and the most complex)

- **Required env (boot-fatal if any missing — `foundation/env/index.ts:216-225`, `AUTH_MODE_REQUIRED_ENV`):**
  `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URIS`, `SESSION_SECRET`.
- **Owner provisioning:** the owner is NOT a fallback in normal operation — they log in via the IdP and are
  elevated by `OWNER_GROUP` (IdP group) or `OWNER_HANDLES` (exactly one; a multi-handle list is boot-fatal,
  `:595-605`). This is exactly how the live box works (per the `.env` notes). `OIDC_ADMIN_GROUPS` /
  `OIDC_ALLOWED_GROUPS` gate admin and login access.
- **THE PROXY-HEADER CONTRACT (must get right for a container):** the callback `redirect_uri` is derived
  per-request from `X-Forwarded-Proto` + `X-Forwarded-Host`, defaults proto to `https`, and is accepted only
  on EXACT match to `OIDC_REDIRECT_URIS` (`auth-routes.ts:530-549`, `deriveRedirectUri`). Behind Caddy this
  works **iff Caddy forwards `X-Forwarded-Proto: https` and `X-Forwarded-Host: <fqdn>`** (Caddy's
  `reverse_proxy` sets both by default). Then it builds `https://<fqdn>/api/auth/oidc/callback`, which must
  be listed verbatim in `OIDC_REDIRECT_URIS` AND registered at the IdP. The proto defaults to `https` when
  no XFP is present (`:540-541`), so a plain-HTTP deploy's candidate misses the allowlist and 400s —
  fail-closed, not open-redirect.
- **Egress firewall + the IdP:** `EGRESS_FIREWALL` defaults ON and blocks outbound to private/reserved IPs
  (`egress.ts:88-160`). The OIDC issuer host is **auto-allowed** (`:99-106`), so oidc discovery/token works
  with the firewall on even when the IdP is on a private IP. No `EGRESS_ALLOWLIST` needed for the IdP.
- **Container posture:** issuer/client-id/secret/redirect-uris/session-secret via secrets; the container must
  sit behind the TLS proxy that sets XFP/XFH. `startOidcGcScheduler` (`lifecycle.ts:449`) runs in-process — no
  external cron.
- **Debug gate:** admin session cookie OR `DEBUG_TOKEN`. Same as local.

### 3.4 `forward-header` (behind authentik/authelia forward-auth)

- **Two paths (`infra/auth/modes/forward-header.ts`):**
  - **SIGNED (JWT+JWKS):** `FORWARD_AUTH_VERIFY_JWT` (default ON, `env:441`) + a JWKS allowlist. The allowlist
    is `FORWARD_AUTH_JWKS_ALLOWLIST` or, absent that, the `OIDC_ISSUER` host; **empty ⇒ fail-closed**
    (`infra/auth/config.ts:28-44`, `forward-header.ts:87-96`). Trusts claims cryptographically, skips the IP
    gate. A JWT without its JWKS, or a verified JWT with no username claim, is REJECTED, never falls through
    (`:86-115`).
  - **UNSIGNED (raw identity headers):** gated fail-closed on `FORWARD_AUTH_TRUSTED_PROXIES` matched against
    the **raw TCP peer IP** (never the spoofable XFF/X-Real-IP — `forward-header.ts:124-149`, `peerIp` from
    `infra/network/ingress.ts:56`). Empty allowlist ⇒ the unsigned path is fail-closed; boot warns loudly
    (`lifecycle.ts:393-396`).
- **Container posture — the peer-IP gotcha:** inside the compose network the TCP peer the app sees is the
  reverse-proxy's container IP (Caddy is pinned to `172.18.0.100`, `docker-compose.yaml:157`), which is in
  `172.16.0.0/12` (RFC1918, DEFAULT_TRUSTED_RANGES `ip-ranges.ts:181`). So for the UNSIGNED path
  `FORWARD_AUTH_TRUSTED_PROXIES` must be set to the proxy's exact container IP — recommend `172.18.0.100/32`,
  **NOT** the whole subnet (any container on the net would otherwise forge `Remote-User: owner`). For the
  SIGNED path the peer gate is irrelevant (crypto replaces it); prefer signed.
- **Egress + JWKS:** if the signed path's JWKS host is INTERNAL (private IP), it is NOT auto-allowed like the
  OIDC issuer is — set `EGRESS_ALLOWLIST=<jwks-host>` (or point `FORWARD_AUTH_JWKS_ALLOWLIST` at a
  publicly-resolving host). Flag for the deployer.
- **Debug gate — the STANDING NOTE (`entry/auth/seam.ts:296-303`):** `isAdmin` passes no `peerIp`, so at the
  debug gate only the SIGNED-JWT arm can mint `via:"header"`; the unsigned raw-header arm is unreachable there.
  A tRPC request (which DOES thread `peerIp`) admits a wider set than the debug gate in an unsigned
  forward-header deployment. This asymmetry is deliberate and documented — do not "fix" it by threading
  `peerIp` into `isAdmin` (that collapses the gate's strength onto `FORWARD_AUTH_TRUSTED_PROXIES`).

### 3.5 Matrix summary

| Mode | Required secrets (boot-fatal) | Owner-fallback gate | HTTPS-at-edge required? | Secure default for a stranger |
| - | - | - | - | - |
| single-user | none (`AUTH_FALLBACK=owner` REQUIRED — `deny` is boot-fatal, it authenticates nobody) | loopback TCP peer (given `AUTH_FALLBACK=owner`) | no (and it cannot serve a non-loopback caller at all) | ON-BOX/loopback only — a published container port authenticates nobody (§3.1 fork); a same-host loopback proxy is the one shape that DOES re-open world-owner |
| local | `SESSION_SECRET` (only); `LOCAL_INITIAL_PASSWORD` is optional in code but required-in-practice for a container (first-run setup is loopback-peer-gated) | loopback TCP peer (prod+owner is boot-fatal) | YES (`__Host-`/Secure cookie) | `AUTH_FALLBACK=deny` for public multi-user |
| oidc | `OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_URIS`, `SESSION_SECRET` | loopback TCP peer (prod+owner is boot-fatal) | YES (cookie + callback proto) | works out of the box behind TLS proxy; owner via `OWNER_GROUP` |
| forward-header | none hard-fatal; signed path needs a JWKS source | fallback: loopback TCP peer; SSO signed: n/a; unsigned: TCP-peer trusted-proxy gate | recommended | prefer SIGNED; unsigned needs `FORWARD_AUTH_TRUSTED_PROXIES=<proxy-ip>/32` |

### 3.6 Engine posture — Profile 1 (all-in-one) and Profile 2 (external/off)

#### Profile 1 — the fleet lives IN the container (owner's default)

orb and the three engines (`gen`/`embed`/`rerank`) run in ONE container, one PID + network namespace, one
GPU passthrough. This replicates the bare-host `pnpm stack up prod` topology, which is: the stack tool's prod
half (`tooling/src/stack/ops/prod-up.ts`) spawns
the SERVER detached (`node entry/index.ts`, NODE_ENV=production — the plan is built by
`buildProdSpawnPlan`, `tooling/src/stack/lib/spawn-plan.ts:27`), and the SERVER — under
`ENGINES_POSTURE=adopt-or-start` — runs the in-process supervisor that triggers a **detached `setsid` fleet
spawn** when an engine is down (`supervisor.ts:1-5`). The container inherits that exact flow.

**Config for profile 1:**

- **`ENGINES_POSTURE=adopt-or-start`** — the container IS the fleet's owner and spawns it (NOT `adopt-only`:
  that is the passive-consumer posture for a fleet someone else runs). `postureManages` is true, so the
  supervisor owns spawn + auto-sleep (`foundation/env/posture.ts`).
- **`VLLM_BIN` / `VLLM_PY`** → the in-image vLLM binary + python (the code already expects the Docker image to
  set these — `spawn-engine.ts:58-59`). **`HF_HOME` / `VLLM_CACHE_ROOT` / `VLLM_STORE_ROOT`** → the in-image
  (or volume-mounted) model cache.
- **`VLLM_ENGINE_HOST` unset ⇒ `127.0.0.1`** — correct as-is; the fleet shares the namespace.
- **`--gpus all`** at runtime (NVIDIA Container Toolkit on the host); `--shm-size` raised for vLLM.

**Do the §-earlier "remote engine" findings bite profile 1? CONFIRMED against the code: NO.**

- **The `VLLM_ENGINE_HOST` URL change — NOT needed (and it has since LANDED anyway).** `engineBaseUrl` →
  `http://${VLLM_ENGINE_HOST}:<port>` (`engine-url.ts:23-25`) defaults to `127.0.0.1`, which is literally
  correct when the fleet is in the same namespace.
- **The egress app→vllm hop — NOT an issue.** `internalBackendHostPorts` bypasses the firewall for
  `${VLLM_ENGINE_HOST}:${VLLM_*_PORT}` (`egress.ts:83-86`), which is exactly what the loopback fleet uses.
  No new allowlist entry.
- **The GPU-detect gate — does NOT misfire here, and its fix has LANDED.** `gpuPresent = detectGpu()` execs
  `nvidia-smi -L` on the app process (`lifecycle.ts:223-226`); the GPU is passed to THIS container, so
  `gpuPresent=true` → the backend registers under `adopt-or-start`. **REPAIRED 2026-08-19:** this bullet's
  "still worth the fix" note is stale — `effectiveVllmDisabled` already gates the local-GPU requirement on
  `postureManages(posture)` (`foundation/env/posture.ts:61-65`), so a passive `adopt-only` consumer of a
  remote engine no longer needs a local GPU.

**Fleet-launch reconciliation (`never-run-engine-launcher-live` + ~34 GiB/card):**

- The detached-`setsid` design makes the fleet "nobody's child" so a SERVER restart reuses a warm fleet via
  adopt (`supervisor.ts:1-5`). Inside a container this is naturally bounded: a *server-process* restart keeps
  the fleet warm (same PID namespace), while `docker stop` reaps the whole namespace — fleet included. So the
  container is a clean lifecycle boundary for the immortal-launcher class, not a leak.
- ~34 GiB VRAM/card (2×A6000 class, `foundation/env` header) is a HARD runtime floor: profile 1 refuses to be
  useful without adequate GPU. Cold fleet spawn is slow (the stack.sh boot-readiness bounds exist for exactly
  this) — the container's healthcheck must allow a long `start_period` (minutes) so the orchestrator doesn't
  kill the container while the fleet warms. Engines bind loopback (`--host LOOPBACK_HOST`, `build-argv.ts:210-211`),
  which is correct and keeps them off the network — do NOT expose the engine ports from the container.

#### Profile 2 — external engine URL or engines-off (the "everyone" arm)

The slim app-only image, no CUDA/vLLM/models. Two arms, both via env, no fleet in the image:

- **D3 engines-off (default for a GPU-less deployer): `ENGINES_POSTURE=off`** — cloud/OpenRouter/agent-sdk
  models only; the supervisor is never registered (`postureRegistersBackend` false, `lifecycle.ts:203`).
- **D2 external engine: `ENGINES_POSTURE=adopt-only` + `VLLM_ENGINE_HOST=<host>`** pointing at a vLLM/
  OpenAI-compatible endpoint elsewhere. **REPAIRED 2026-08-19 — all three code changes this arm was
  waiting on are BUILT; nothing here blocks profile 2:**
  1. `engineBaseUrl` reads `VLLM_ENGINE_HOST` host-only, `VLLM_*_PORT` intact (`engine-url.ts:23-25`,
     `env:298`). DONE.
  2. `internalBackendHostPorts` reads the same `VLLM_ENGINE_HOST` (`egress.ts:83-86`), so an external
     private-IP engine is not blocked by the egress gate. DONE. (`EGRESS_ALLOWLIST=<host>` remains the
     fallback for a non-engine internal host.)
  3. The GPU-detect gate is `postureManages`-scoped (`foundation/env/posture.ts:61-65`), so a GPU-less app
     container DOES register the external engine under `adopt-only`. DONE.

## 4. The container trust model — the peer-gated owner fallback + the prod boot guard (#298 f2, owner ruling 2026-08-19)

This is the section the "designing for everyone" contract lives or dies on.

**The owner fallback is gated on the raw LOOPBACK TCP peer, NOT the `Host` header** (`infra/auth/dispatch.ts`,
`ownerFallbackAllowed(peerIp)`; re-gate #298 f2, 2026-08-19). It returns true iff the socket peer is loopback
(`127.0.0.0/8` / `::1`) — ONE rule across all four modes, `single-user` included. The credential is the
unspoofable socket the kernel reports, so a client-supplied `Host:` (the old `isLocalOrigin` gate, now
removed) grants NOTHING. `peerIp` is the same anti-spoof value the forward-header trusted-proxy gate uses
(`entry/app.ts` → `PerRequestSeamDeps.peerIp`), never `X-Forwarded-For`/`X-Real-IP`.

**The peer-vs-proxy topology model (the contract this section exists to state):**

- A request that reaches the app over a NON-loopback socket — a LAN device hitting a published port, a
  container on `inktomi-net`, Caddy running in its own container and proxying to `host.docker.internal:8788`
  (peer = the docker bridge, `172.18.0.x`) — gets NO fallback and MUST authenticate. This is correct and is
  the intended public posture: SSO everywhere Caddy fronts.
- A request that reaches the app over a LOOPBACK socket gets the un-credentialed owner fallback (if
  `AUTH_FALLBACK=owner`). The two topologies that produce a loopback peer: (a) a genuine on-box caller
  (`ssh` + `curl 127.0.0.1` — the break-glass door, and the dev-tooling door); (b) **a SAME-HOST reverse
  proxy that terminates on the box and forwards to the app over `127.0.0.1`** — and in (b) EVERY external
  user's request arrives as a loopback peer, so `AUTH_FALLBACK=owner` would mint owner for the whole internet
  and bypass SSO. Topology (b) is the hazard the boot guard below closes.

**The exploit, and why a forged `Host` no longer achieves it:** `GET /api/trpc/... Host: 127.0.0.1` with no
cookie now resolves UNAUTHENTICATED whenever the caller's socket is not loopback (a published port, another
container). The old critical (`Host`-spoof → owner) is closed at the source. The residual is exactly topology
(b) — a same-host loopback proxy paired with `AUTH_FALLBACK=owner` — which the prod boot guard makes
unrepresentable.

**THE RESIDUAL'S PRICE ROSE ON 2026-09-02 (#1193) — re-read it before accepting it again.** The one accepted
gap is a hand-rolled launch that OMITS `NODE_ENV` (a bare `node entry/index.ts`; both supported prod
launchers set it in `buildProdSpawnPlan`) behind a loopback proxy with the default `AUTH_FALLBACK=owner`.
That used to cost exactly the SSO bypass: every external request resolves as the owner. It now costs
`/api/_debug/*` as well — the debug gate's fallback arm is credentialed by
`resolveOwnerFallbackCredential`, which reads the SAME omitted `NODE_ENV`, so a box that lies about being
production hands the diagnostics surface (whole-db reads, and with `WIRE_CAPTURE=on` the RAW PROVIDER REQUEST
BODIES) to the same laundered callers, with no `DEBUG_TOKEN` needed. One missing env var, two doors instead
of one. The mitigation is unchanged and now doubly load-bearing: **use the supported launchers** (`pnpm stack
up prod` / `start-fg prod`), and set `IP_ALLOWLIST` — it is the only control that bounds either door when the
process is lying about its own posture.

**What is NOT exposed regardless:** `/api/_debug/*`. AUTHFIX-2 (`entry/auth/seam.ts`) keeps the fallback out
of the debug gate — and since #1193 that exclusion is stated as a POSTURE rather than an absolute:
`debugGateCredentialed().fallback` is `resolveOwnerFallbackCredential`, false whenever
`NODE_ENV === "production"`, which is every deployment this spec describes. **The second belt is gone by
design** (the verdict now reads the request's already-resolved principal, which does carry a peer, instead of
re-resolving without one), so the production exclusion rests on the posture alone — that is why the posture
is production-EXCLUDING rather than "SSO-modes-only". Enforcer:
`tests/server/entry/debug-gate.suite.test.ts` (every AUTH_MODE × Host × peer × posture × token state,
including "the PRODUCTION posture refuses the same loopback owner, single-user included").

**The secure-default answer (belt AND suspenders):**

1. **The image/compose MUST NOT publish orbweaver's port to the host** (`expose: ["8788"]`, never `ports:`).
   Only Caddy reaches it. A COMPOSE/deploy fact, not a code change. With the peer gate this is now defense in
   depth rather than the sole control, but it stays required.
2. **A production SSO deploy MUST set `AUTH_FALLBACK=deny` — and the app now REFUSES TO BOOT otherwise**
   (`foundation/env/index.ts` superRefine, #298 f2). `NODE_ENV=production` + an SSO mode (local/oidc/
   forward-header) + `AUTH_FALLBACK=owner` is boot-fatal: it is precisely topology (b)'s mass SSO bypass,
   and it cannot be reliably detected as "behind a proxy" at boot, so production is the signal. The owner
   authenticates via SSO and is elevated by `OWNER_GROUP`/`OWNER_HANDLES` — **no owner bootstrap is needed
   for pure OIDC**: `entry/boot/seed-owner.ts` seeds the owner row at `role=owner`+`enabled` every boot, so
   `deny`+`oidc` can never lock the owner out at first-run (owner is claim-driven, not fallback-driven).
   The ONLY prod exception is a deliberate on-box recovery session opted into with `AUTH_BREAK_GLASS=true`
   (lifecycle then warns loudly every boot) — see §Break-glass below.

   **`single-user` is NOT an SSO mode and keeps `AUTH_FALLBACK=owner`** (its only credential IS the fallback;
   `deny` there is separately boot-fatal). The boot guard is scoped to the SSO modes. A single-user box
   behind a SAME-HOST loopback proxy is still a world-owner shape by construction — that topology, not raw
   reachability, is now what makes single-user dangerous, because a non-loopback peer gets nothing at all.
   **RULED DEFAULT (owner, 2026-08-08):** the image ships `single-user` + `AUTH_FALLBACK=owner` so a
   stranger's first run is usable-as-owner with no setup. **The #298 f2 peer re-gate INVALIDATED that
   default's premise for a container** (a published port is not a loopback peer — §3.1's fork); the ruling
   survives, its INPUT changed. Re-rule before the build lane ships an image default.
3. **`TRUSTED_LOCAL_HOSTS` is GONE** — the Host-origin gate it fed was removed with #298 f2. The env var and
   its `AuthConfig` field no longer exist; the image ships neither (verified 2026-08-19: no
   `isLocalOrigin`/`trustedLocalHosts`/`TRUSTED_LOCAL_HOSTS` symbol survives anywhere under `packages/`).
   (`TRUSTED_PRIVATE_RANGES` survives, but ONLY as the egress/SSRF belt extension —
   `infra/network/egress.ts` — never the auth gate.)

**Break-glass (on-box recovery when SSO/Authentik is down):** with `deny` there is no ambient (off-box)
recovery — that is the point. On the box: set `AUTH_FALLBACK=owner` + `AUTH_BREAK_GLASS=true` (the flag is
mandatory — without it the prod SSO+owner combo is boot-fatal), restart, then `curl http://127.0.0.1:8788/...`
authenticates as owner over the loopback socket. Revert both knobs when done. `AUTH_BREAK_GLASS` unlocks the
boot guard only; it does NOT itself enable the fallback (`AUTH_FALLBACK=owner` does).

> **CRITICAL — STOP OR BYPASS THE FRONT PROXY while break-glass is active.** If a same-host reverse proxy that
> connects to the app over `127.0.0.1` is still running, break-glass does NOT limit owner to the on-box
> operator: EVERY request the proxy forwards arrives on a loopback socket, so every LAN/internet user behind
> that proxy is minted owner — the full #298 hole, reopened for the whole network, for as long as the flag is
> set. Do the recovery through a path that reaches the app WITHOUT the proxy's loopback hop: stop the proxy
> (or its orbweaver site-block) first, OR curl the app's loopback listener directly from an on-box shell while
> the proxy is down. This is exactly why break-glass is a brief, on-box, proxy-off procedure — never a knob
> left flipped on a live public deployment.

Tertiary path if the owner wants a durable credential instead: `AUTH_MODE=local` with `LOCAL_INITIAL_PASSWORD`
and log in over the HTTPS origin (no fallback, no proxy caveat). Documented at the seam
(`entry/auth/seam.ts`, the `via:"fallback"` arm).

**`.env` interaction — how ONE image runs dev=owner and prod=deny (ties to #301):** `AUTH_MODE` lives in
`.env`, which `foundation/env` loads with **`override:true`** (the `.env` value WINS over a process export —
the #301 footgun), so BOTH stack modes read `AUTH_MODE=oidc` from `.env`. The discriminator between the two is
the run command, not the mode: the prod arm (`pnpm stack up prod` / `start-fg prod`) spawns
`NODE_ENV=production node …` (the ONLY place production is set); the dev arm (`pnpm stack up`, i.e.
`stack.sh` → `dev.sh`) and the e2e webServer set no `NODE_ENV` → `development`. For prod to run
`deny` while dev keeps the frictionless auto-owner, **`AUTH_FALLBACK` MUST NOT be placed in `.env`**: leave it
unset so dev falls to the schema default `owner` (loopback vite proxy → auto-owner, no OIDC in dev), and have
the prod start command/compose export `AUTH_FALLBACK=deny`. If `AUTH_FALLBACK=owner` ever lands in `.env`,
`override:true` forces it into prod too and the boot guard (correctly) refuses to start prod — a loud failure,
not a silent bypass. The dev boot is untouched by the guard because it is `NODE_ENV=development`.

**Behavioral change the owner accepts:** the old bare-host deploy gave "owner on the raw LAN IP (bypasses
Caddy)" because a LAN device could send a private `Host`. That path is GONE regardless of container/port
posture — a LAN device's peer is not loopback, so it authenticates via SSO like everyone else. The owner's
LAN access is the same HTTPS/OIDC origin as the internet (owner ruling 2026-08-19: OIDC everywhere).

**All four modes stay first-class (not an OIDC-only story):** the guard and the `deny` requirement apply
equally to the three CREDENTIALED SSO modes — **oidc** (JWT/OIDC login), **local** (password + `__Host-`
cookie), **forward-header** (trusted-proxy header / signed JWT) — each has its own real door, so its ambient
loopback owner-fallback must be OFF in any public deployment (prod+owner is boot-fatal for all three).
**single-user** is exempt from the guard because the fallback is its ONLY credential (`deny` there is
separately boot-fatal); a publicly-bound single-user box instead earns a loud standing boot WARNING
(`entry/lifecycle.ts:530-534`) — it is the "no login" mode, and post-#298-f2 its warning is correctly
scoped to the caller who reaches it **over a loopback socket** (on-box, or via a same-host proxy hop),
not to every reachable caller. Intended for a private/first-run box only. Dev keeps the loopback
auto-owner in every mode.

**Peer-IP / XFF trust inside the network (secondary, correct-by-default):** because Caddy's peer IP is
private, `resolveClientIp` (`ingress.ts:29-42`) trusts the leftmost `X-Forwarded-For` hop, so `IP_ALLOWLIST`
and per-IP rate limits see the REAL client IP — provided Caddy sets XFF (default). Good. No change needed.

## 5. Secrets & the debug / wire-capture posture for a shipped image

- **`DEBUG_TOKEN`:** UNSET in the image → the entire `/api/_debug/*` surface returns 404
  (`env:249`, `debug/routes.ts:213-218` — the gate's `expectedToken`). The live `.env` sets it for card-bug diagnosis; the image and
  its `.dockerignore` must guarantee it is never baked. A deployer opts in explicitly.
- **`WIRE_CAPTURE` / `RPG_TRACE`:** default `off` (`env:253,258`) → the sinks are never wired, turns are
  byte-identical and zero-retention. The image must not set them. When off, `/api/_debug/wire/*` returns `[]`
  by construction even if the gate is open.
- **`SESSION_SECRET` / `OIDC_CLIENT_SECRET` / `CREDENTIALS_KEY`:** env-injected or mounted-secret files,
  never layers. `CREDENTIALS_KEY` is 32 bytes for AES-256-GCM; **losing it makes every stored BYOK credential
  undecryptable** (`.env` warning; `env:448-450`). Two supported arms: supply it as a persistent secret, OR
  set `CREDENTIALS_KEY_AUTO=true` to auto-generate+persist on first boot (requires the data volume to persist).
  Recommend an explicit injected secret for prod. The boot decrypt-probe drives `/healthz` → 503
  `credentials_key_mismatch` if the key stops matching the ciphertext (`healthz.ts:26`,
  `lifecycle.ts:258-260`) — a good deploy canary.
- **`EGRESS_FIREWALL`:** keep default ON. It is the SSRF backstop for provider/OIDC egress; the user-influenced
  paths self-enforce regardless (`egress.ts` header). Only add `EGRESS_ALLOWLIST` for a genuinely internal IdP
  JWKS host (§3.4).
- **Security headers / CSP:** owned by the app, env-aware, per-request (`entry/app.ts:175`); Caddy must NOT
  duplicate the CSP (the Caddyfile already notes this, `:373`). The image sets `NODE_ENV=production` so the CSP
  drops its dev allowances.

## 6. Compose integration

- **Orbweaver as a real service on `inktomi-net` (Profile 1, all-in-one — the owner's default):**
  ```yaml
  orbweaver:
    image: orbweaver:<tag>-gpu        # Profile 1: orb + fleet + CUDA (Profile 2 uses orbweaver:<tag>-slim)
    expose: ["8788"]                  # NEVER ports: — see §4; engine ports are NOT exposed (loopback only)
    env_file: [ ./secrets/orbweaver.env ]   # AUTH_MODE + the mode's secrets; ENGINES_POSTURE=adopt-or-start;
                                            # VLLM_BIN/VLLM_PY/HF_HOME → in-image paths; VLLM_ENGINE_HOST unset (127.0.0.1)
    volumes:
      - orbweaver_data:/app/data      # sqlite + CAS + variants
      - hf_cache:/models              # (optional) model cache if not baked — see Fork D sub-fork
    shm_size: "8gb"                   # vLLM needs a larger /dev/shm
    networks: { inktomi-net: {} }
    deploy:
      resources:
        reservations:
          devices: [{ driver: nvidia, count: all, capabilities: [gpu] }]   # GPU into THIS container
    healthcheck:
      test: node -e "...healthz..."
      start_period: 300s             # LONG — the cold fleet spawn (§3.6) must not trip the healthcheck
      interval: 30s
      retries: 3
    depends_on: { caddy: ... }
  ```
  Requires the NVIDIA Container Toolkit on the host. Profile 2 drops the `deploy.resources`, `shm_size`, the
  model volume, and sets `ENGINES_POSTURE=off` (or `adopt-only` + `VLLM_ENGINE_HOST=<external>`).
- **Repoint Caddy off `host.docker.internal`:** in `caddy/conf/Caddyfile:385` change
  `reverse_proxy host.docker.internal:8788` → `reverse_proxy orbweaver:8788` (service DNS on the shared
  network). Keep `flush_interval -1` and the 1800s read/write timeouts (D118 single multiplexed SSE socket —
  `Caddyfile:386-390`). Once no host-hosted service remains, the `extra_hosts` mapping
  (`docker-compose.yaml:148-150`) can be dropped — but that is the compose owner's call, and neo-tavern may
  still use it.
- **TLS / HTTP-3 (I-10 launch items):** Caddy already publishes `443:443` AND `443:443/udp` and `80:80`
  (`docker-compose.yaml:139-141`) — UDP/443 for QUIC is in place. Caddy auto-manages the cert for
  `orbweaver.inktomi.tech` and emits `Alt-Svc` for h3 by default. No app change; verify at launch that h3 is
  negotiated and `Alt-Svc` is present (a live check, out of scope here).
- **Proxy header contract (must hold for oidc, §3.3):** Caddy `reverse_proxy` must pass `X-Forwarded-Proto`,
  `X-Forwarded-Host`, `X-Forwarded-For` (all default). Do not strip them.

## 7. Forks that need the owner's ruling (each with a recommended arm)

- **Fork A — base image.** *Recommend `node:26` builder + `node:26-slim` runtime (Debian/glibc).* Rejected:
  Alpine/musl (native `@libsql` + TS-strip risk, no proven path); distroless (loses the shell the healthcheck
  and debugging want, and node-distroless lags the 26 tag). Cost: slim image is ~200-300 MB larger than
  distroless; worth it for operability.

- **Fork B — single-image-all-modes vs per-mode images.** *Recommend ONE image, mode selected by
  `AUTH_MODE` env.* The code already dispatches on the env union and fails closed on misconfig; per-mode
  images would duplicate everything for zero security gain. A stranger flips one env var.

- **Fork C — `AUTH_FALLBACK` default + port publication for the owner's own box.** *Recommend: image/compose
  default `expose`-only (no host port) + `AUTH_FALLBACK` documented as `deny` for public multi-user.* For the
  OWNER's GPU box specifically, two arms:
  - **C1 (recommended): pure-SSO.** Don't publish the port. In an SSO mode `AUTH_FALLBACK` must be `deny`
    anyway (prod+owner is boot-fatal), and the peer gate already denies every proxied request. Owner logs
    in via oidc, elevated by `OWNER_GROUP`. Loses raw-LAN owner convenience.
  - ~~**C2: keep raw-LAN owner.**~~ **DEAD ARM (2026-08-19, #298 f2):** publishing the port no longer buys
    LAN-owner — a LAN peer is not loopback, and forging a private `Host` grants nothing. The only way back
    to ambient LAN owner would be widening the fallback's peer set, which is the hole #298 closed. If the
    owner still wants credential-free LAN access, that is a new decision, not this arm.

- **Fork D — engine packaging (the two-profile decision, §2 + §3.6).** *Recommend: ship BOTH, with Profile 1
  as the default the owner runs and Profile 2 as the documented "everyone" alternative.*
  - **Profile 1 (DEFAULT): all-in-one GPU image** — orb + the 3-engine fleet + CUDA + models, one namespace,
    loopback, `ENGINES_POSTURE=adopt-or-start`, `--gpus all`. Turnkey for the owner + GPU self-hosters. HUGE
    and GPU-mandatory (~34 GiB VRAM/card). None of the remote-engine plumbing bites it (§3.6 confirmed).
  - **Profile 2 (alternative for GPU-less/cloud deployers): slim app-only image** — `ENGINES_POSTURE=off`
    (D3), or `adopt-only` + `VLLM_ENGINE_HOST` at an external engine (D2). Small. This arm is what keeps the
    "designing for everyone" contract; the `VLLM_ENGINE_HOST` lever and the posture-scoped GPU-detect gate that
    make it work are already BUILT (§3.6 D2, re-derived 2026-08-19) and are inert for profile 1.
  - Sub-fork: **models baked into profile 1 vs a mounted HF-cache volume.** Baked = truly turnkey but a
    multi-GB image; volume = smaller image, first-boot model pull (needs egress to the HF host). Owner picks.

- **Fork E — production dependency pruning for a source-run TS workspace.** The server runs `.ts` source and
  imports workspace packages as source, so a naive `--prod` install can drop something node needs at runtime,
  while the full install drags in vitest/playwright/stryker. *Recommend `pnpm deploy --filter @orb/server --prod` into a self-contained dir* (resolves the workspace graph, prunes dev deps), verified by a boot smoke
  test in the build lane. Fallback arm: carry the full `--frozen-lockfile` install and accept the size. The
  build lane must PROVE the runtime image boots (`/healthz` 200) before this fork is closed.

- **Fork F — pentest cage same-lane or separate.** *Recommend SEPARATE.* The live paths worth an adversarial
  pass are now the SAME-HOST-proxy loopback-peer laundering (§4 topology (b), incl. an accidental
  break-glass flag left set), the unsigned forward-header peer gate, the debug gate across modes, and the
  CSRF content-type surface (`Spine-Identity-and-Auth.md` invariant #9's OPEN tRPC finding — a CORS-simple
  `multipart/form-data` mutation on the loopback-fallback arm). That is a verification lane against a
  running container, not part of the image design. The debug-gate suite already encodes the matrix; the cage would exercise the network
  reachability the suite cannot.

## 8. Explicit security assumptions (for review)

- **A1 (REWRITTEN 2026-08-19 — the Host-routing assumption is no longer load-bearing):** the owner fallback
  no longer keys on `Host` at all, so Caddy's Host-routing is not what stands between an anonymous public
  request and owner. What IS load-bearing: **Caddy must not reach the app over `127.0.0.1`.** A same-host
  proxy hop makes every external request a loopback peer (§4 topology (b)); today's container-to-container
  hop (peer = the docker bridge) is what keeps the fallback shut. Re-audit on any change that moves the
  proxy onto the app's host or introduces a loopback forwarder — and keep `AUTH_FALLBACK=deny` in prod SSO
  (boot-enforced) so the topology is not the only control.
- **A2:** The orbweaver port is `expose`-only. A `ports:` mapping or a compromised neighbour on
  `inktomi-net` no longer yields owner by itself (those peers are not loopback) — it yields unauthenticated
  reach to the app's public surface, plus whatever a compromised neighbour can do to the proxy. Keep
  `expose`-only as defense in depth.
- **A3:** `__Host-`/`Secure` cookies assume HTTPS at the browser edge for local/oidc. Plain-HTTP deploys of
  those modes silently fail login — documented, not defended in code.
- **A4:** node 26 TS type-stripping runs the server source as-is in prod; the build lane must confirm no
  `.ts` in the server/kit/contracts/db runtime path needs a transform node 26 does not do natively (e.g. an
  enum/namespace/decorator would need a build step). Verify with a boot smoke test.
