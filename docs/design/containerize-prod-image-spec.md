---
kind: design
status: draft
owner-review: REQUIRED (forks in §7)
updated: 2026-08-08
---

# Production container image + deployment spec (all auth modes)

> DESIGN-ONLY. No code was touched, no stack run. This spec is read against TODAY's tree; every
> load-bearing claim carries a `path:line` receipt. A build lane follows once the owner rules §7.
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

1. **The server is NOT compiled — node 26 runs `.ts` directly.** `pnpm start` = `NODE_ENV=production node
   packages/server/src/entry/index.ts` (`package.json:35`); `engines.node >= 26`, `packageManager
   pnpm@11.15.1`. The only build artifact is the client bundle (`vite build` → `packages/client/dist`,
   `packages/client/package.json` `build`). So "build" = install deps + `pnpm --filter @orb/client build`;
   the server ships as source `.ts` + its workspace deps (`kit`/`contracts`/`db`) as source.
2. **The vLLM engine base URL is hardcoded to `127.0.0.1` — and that hardcode is the LEVER, not a wall.**
   `engineBaseUrl` builds `http://127.0.0.1:${PORTS[engine]}` at ONE site
   (`infra/providers/vllm/engine/engine-url.ts:17-20`), and the egress firewall's internal-backend bypass
   hardcodes the same `127.0.0.1:${VLLM_*_PORT}` (`infra/network/egress.ts:81-83`). The correct deployment
   **co-deploys vLLM as a sibling container** (owner: "it uses the vllm container image … the vllm would be
   in the image with it"), so the engine IS reachable — only the *address* changes. Making the host component
   configurable is the small code change that unlocks it (see §3.6 + Fork D). This is why the image can serve
   GPU inference for everyone, not just cloud-only deployers.

## 1. The four auth modes (the enumeration)

`AUTH_MODES = ["single-user", "local", "forward-header", "oidc"]`
(`packages/contracts/src/identity/index.ts:28`). Dispatch is exhaustive over this union
(`infra/auth/dispatch.ts:28-33`, `MODE_RESOLVERS`); a fifth mode fails `tsc`. Config is parsed once from
env and frozen (`foundation/env/index.ts:409`), with a boot-fatal `superRefine` (`:365-405`) that refuses
a misconfigured `oidc`/`local`/`OWNER_HANDLES` deploy at module load — a misconfigured box never silently
degrades to owner-on-the-public-FQDN.

The identity pipeline is three tiers, and the split matters for what the container must get right:
- **VERIFICATION** (`infra/auth`, db-free, sealed): headers → pre-row `ResolvedIdentity` + the origin-gated
  owner-fallback discriminant. No role, no userId, no upsert (`infra/auth/index.ts:37-65`).
- **RESOLUTION** (`domain/sessions`): role policy + users-row upsert.
- **CONSTRUCTION** (`entry/auth/seam.ts`): the ONE `Principal` mint.

## 2. The production image

**Base:** `node:26` in the builder, `node:26-slim` (Debian) at runtime — matches the toolchain the
devcontainer already proves (`FROM node:26`, `corepack enable`) and the `>=26` engines pin. Do NOT use
Alpine: node 26's native TS type-stripping + libSQL's native bindings (`@libsql/client`) are lower-risk on
glibc than musl, and the devcontainer's proven path is Debian. (Fork A: base image.)

**Multi-stage:**

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
  (`entry/lifecycle.ts:216`, `foundation/env/index.ts:188,193`). Mount one volume at `/app/data`. Boot runs
  `runBootMigrations` (`entry/lifecycle.ts:167`), so a fresh volume self-migrates.
- **Client dist IS baked** (`CLIENT_DIST_DIR=./packages/client/dist`, prod-boot-fatal if missing —
  `foundation/env/index.ts:191`, `entry/app.ts:285`). It is an immutable build artifact, not state.
- **Secrets via env / mounted secret files, NEVER layers.** No `ENV SESSION_SECRET=…`, no `.env` copied in
  (`.gitignore` already excludes it; the Dockerfile must `.dockerignore` it too). The `.env` loader is a
  silent no-op when the file is absent (`foundation/env/index.ts:117-122`), so env-var injection is the
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

### 3.1 `single-user` (default, `AUTH_MODE` schema default — `foundation/env/index.ts:292`)

- **What it is:** no SSO, no cookies, no headers. EVERY request resolves to the owner via the
  **unconditional** owner fallback (`infra/auth/modes/single-user.ts:9`, `dispatch.ts:41-43`
  `ownerFallbackAllowed` returns `true` for `single-user` unconditionally).
- **Env/secrets:** none required. `AUTH_FALLBACK` is irrelevant (fallback is unconditional). `SESSION_SECRET`
  not required.
- **Container posture — THE CRITICAL WARNING:** single-user has NO network origin gate. Any request that
  reaches the port is the owner. **This mode is safe ONLY when the port is unreachable by untrusted clients**
  — i.e. behind a proxy that itself authenticates, or on a trusted LAN. Shipping single-user behind Caddy on
  a public FQDN = the whole app open to the internet as owner. The image's default `single-user` is correct
  for a *private/loopback* deploy and DANGEROUS for a public one. The spec's secure-default answer: the
  compose file ships single-user with the port **exposed but not published** (§4) AND documents in the image
  README that public exposure of single-user requires an authenticating front door. A stranger who wants
  multi-user/public picks `oidc` or `forward-header`.
- **Debug gate:** the owner fallback is `via:"fallback"`, which `DEBUG_GATE_CREDENTIALED.fallback = false`
  (`entry/auth/seam.ts:264-272`) — so `/api/_debug/*` is NEVER open to the un-credentialed caller even in
  single-user. It requires `DEBUG_TOKEN` (default unset → 404). Correct.

### 3.2 `local` (app-stored username+password, cookie/BFF sessions)

- **Required env (boot-fatal if missing — `foundation/env/index.ts:380-390`):** `SESSION_SECRET` (≥32 chars,
  HMAC-peppers the token hash), `LOCAL_INITIAL_PASSWORD` (≥8 chars, seeds the owner's first-boot password so
  a non-local-origin box isn't locked out — `entry/boot/seed-owner.ts:67-85`, first-boot-only, never
  clobbers a rotated password).
- **Cookie:** `__Host-orb_session`, `Secure; HttpOnly; SameSite=Lax; Path=/` (`auth-routes.ts:42,113-116`).
  **`__Host-`/`Secure` REQUIRE HTTPS at the browser edge.** Behind a TLS-terminating proxy the app writes
  `Secure` over plain HTTP and the browser (talking HTTPS to Caddy) stores/sends it — works. **A stranger
  who runs local mode on plain HTTP silently cannot log in** (the browser drops the Secure cookie). Deploy
  note: local mode MUST be fronted by HTTPS. No code change; document it.
- **Owner fallback:** `AUTH_FALLBACK` is origin-gated in this SSO-class mode (see §4). Recommended default
  for a public multi-user local deploy: `AUTH_FALLBACK=deny` (fork C).
- **Container posture:** set `SESSION_SECRET` + `LOCAL_INITIAL_PASSWORD` via secrets; multi-user is a runtime
  admin setting (`localMultiUser` → `MULTI_HUMAN_CAPABLE.local`, `entry/app.ts:134-139`), not env.
- **Debug gate:** an admin/owner session cookie passes (`DEBUG_GATE_CREDENTIALED.cookie = true`), else
  `DEBUG_TOKEN`.

### 3.3 `oidc` (the app is an OIDC client — the owner's live mode, and the most complex)

- **Required env (boot-fatal if any missing — `foundation/env/index.ts:368-379`):** `OIDC_ISSUER`,
  `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URIS`, `SESSION_SECRET`.
- **Owner provisioning:** the owner is NOT a fallback in normal operation — they log in via the IdP and are
  elevated by `OWNER_GROUP` (IdP group) or `OWNER_HANDLES` (exactly one; a multi-handle list is boot-fatal,
  `:391-404`). This is exactly how the live box works (per the `.env` notes). `OIDC_ADMIN_GROUPS` /
  `OIDC_ALLOWED_GROUPS` gate admin and login access.
- **THE PROXY-HEADER CONTRACT (must get right for a container):** the callback `redirect_uri` is derived
  per-request from `X-Forwarded-Proto` + `X-Forwarded-Host`, defaults proto to `https`, and is accepted only
  on EXACT match to `OIDC_REDIRECT_URIS` (`auth-routes.ts:277-308`, `deriveRedirectUri`). Behind Caddy this
  works **iff Caddy forwards `X-Forwarded-Proto: https` and `X-Forwarded-Host: <fqdn>`** (Caddy's
  `reverse_proxy` sets both by default). Then it builds `https://<fqdn>/api/auth/oidc/callback`, which must
  be listed verbatim in `OIDC_REDIRECT_URIS` AND registered at the IdP. A plain-HTTP deploy with no XFP
  400s by design (`:278-279`) — fail-closed, not open-redirect.
- **Egress firewall + the IdP:** `EGRESS_FIREWALL` defaults ON and blocks outbound to private/reserved IPs
  (`egress.ts:85-152`). The OIDC issuer host is **auto-allowed** (`:96-103`), so oidc discovery/token works
  with the firewall on even when the IdP is on a private IP. No `EGRESS_ALLOWLIST` needed for the IdP.
- **Container posture:** issuer/client-id/secret/redirect-uris/session-secret via secrets; the container must
  sit behind the TLS proxy that sets XFP/XFH. `startOidcGcScheduler` (`lifecycle.ts:382`) runs in-process — no
  external cron.
- **Debug gate:** admin session cookie OR `DEBUG_TOKEN`. Same as local.

### 3.4 `forward-header` (behind authentik/authelia forward-auth)

- **Two paths (`infra/auth/modes/forward-header.ts`):**
  - **SIGNED (JWT+JWKS):** `FORWARD_AUTH_VERIFY_JWT` (default ON, `env:332`) + a JWKS allowlist. The allowlist
    is `FORWARD_AUTH_JWKS_ALLOWLIST` or, absent that, the `OIDC_ISSUER` host; **empty ⇒ fail-closed**
    (`infra/auth/config.ts:28-44`, `forward-header.ts:92-96`). Trusts claims cryptographically, skips the IP
    gate. A JWT without its JWKS, or a verified JWT with no username claim, is REJECTED, never falls through
    (`:86-115`).
  - **UNSIGNED (raw identity headers):** gated fail-closed on `FORWARD_AUTH_TRUSTED_PROXIES` matched against
    the **raw TCP peer IP** (never the spoofable XFF/X-Real-IP — `forward-header.ts:124-149`, `peerIp` from
    `infra/network/ingress.ts:56-58`). Empty allowlist ⇒ the unsigned path is fail-closed; boot warns loudly
    (`lifecycle.ts:344-348`).
- **Container posture — the peer-IP gotcha:** inside the compose network the TCP peer the app sees is the
  reverse-proxy's container IP (Caddy is pinned to `172.18.0.100`, `docker-compose.yaml:157`), which is in
  `172.16.0.0/12` (RFC1918, DEFAULT_TRUSTED_RANGES `ip-ranges.ts:181`). So for the UNSIGNED path
  `FORWARD_AUTH_TRUSTED_PROXIES` must be set to the proxy's exact container IP — recommend `172.18.0.100/32`,
  **NOT** the whole subnet (any container on the net would otherwise forge `Remote-User: owner`). For the
  SIGNED path the peer gate is irrelevant (crypto replaces it); prefer signed.
- **Egress + JWKS:** if the signed path's JWKS host is INTERNAL (private IP), it is NOT auto-allowed like the
  OIDC issuer is — set `EGRESS_ALLOWLIST=<jwks-host>` (or point `FORWARD_AUTH_JWKS_ALLOWLIST` at a
  publicly-resolving host). Flag for the deployer.
- **Debug gate — the STANDING NOTE (`entry/auth/seam.ts:256-272`):** `isAdmin` passes no `peerIp`, so at the
  debug gate only the SIGNED-JWT arm can mint `via:"header"`; the unsigned raw-header arm is unreachable there.
  A tRPC request (which DOES thread `peerIp`) admits a wider set than the debug gate in an unsigned
  forward-header deployment. This asymmetry is deliberate and documented — do not "fix" it by threading
  `peerIp` into `isAdmin` (that collapses the gate's strength onto `FORWARD_AUTH_TRUSTED_PROXIES`).

### 3.5 Matrix summary

| Mode | Required secrets (boot-fatal) | Origin gate on owner-fallback | HTTPS-at-edge required? | Secure default for a stranger |
| - | - | - | - | - |
| single-user | none | NONE (unconditional owner) | no (but must not be publicly reachable) | private/loopback only; never public without an auth front door |
| local | `SESSION_SECRET`, `LOCAL_INITIAL_PASSWORD` | origin-gated (Host header) | YES (`__Host-`/Secure cookie) | `AUTH_FALLBACK=deny` for public multi-user |
| oidc | `OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_URIS`, `SESSION_SECRET` | origin-gated (Host header) | YES (cookie + callback proto) | works out of the box behind TLS proxy; owner via `OWNER_GROUP` |
| forward-header | none hard-fatal; signed path needs a JWKS source | signed: n/a; unsigned: TCP-peer gate | recommended | prefer SIGNED; unsigned needs `FORWARD_AUTH_TRUSTED_PROXIES=<proxy-ip>/32` |

### 3.6 Engine posture in a co-deployed container (GPU inference)

vLLM ships as a **sibling service in the same compose deployment / network** (the vllm container image runs
the engine; the app container adopts it). The engine is reachable — the only questions are the address, the
egress hop, GPU passthrough, and the posture. Three address shapes:

- **(a) shared network namespace / same pod** (`network_mode: "service:vllm"`, or a k8s pod): both containers
  see ONE loopback, so `http://127.0.0.1:<port>` **literally still works** with zero code change on the URL —
  the current hardcode is correct in this shape. (But see the GPU-gate code change below, which still bites.)
- **(b) separate compose services on one network** (RECOMMENDED — how the owner runs it): the app calls the
  vllm **service name**, `http://vllm:<port>`. This needs the host component to be env-configurable.
- **(c) external engine URL:** a vLLM/OpenAI-compatible endpoint elsewhere — same env lever as (b).

**What must become configurable (exact sites):**
1. **`infra/providers/vllm/engine/engine-url.ts:17-20`** — `engineBaseUrl` hardcodes `http://127.0.0.1:`.
   Introduce `VLLM_ENGINE_HOST` (env, default `127.0.0.1`) and build `http://${VLLM_ENGINE_HOST}:${PORTS[e]}`.
   Host-only keeps the three existing per-engine port vars (`VLLM_*_PORT`) intact. This is the ONE URL the app
   calls engines on (client, wake-gate, fleet-control all resolve through it — `engine/index.ts:30`).
2. **`infra/network/egress.ts:81-83`** — `internalBackendHostPorts` hardcodes `127.0.0.1:${port}`. It MUST
   read the same `VLLM_ENGINE_HOST` so the internal-backend firewall bypass stays host:port-scoped
   (least-privilege) for the sibling. Otherwise: shape (b)'s `http://vllm:<port>` resolves to a private
   container IP and the egress DNS-lookup gate **BLOCKS it** (`egress.ts:118-124`), because the bypass only
   matches `127.0.0.1:<port>`. Fallback without the code change: set `EGRESS_ALLOWLIST=vllm` (host-keyed,
   any-port — looser than the port-scoped bypass). Recommend the code change over the allowlist.

**The GPU-detect gate — a SECOND required code change for shapes (a)/(b), independent of the URL.**
`entry/lifecycle.ts:201-203` computes `vllmDisabled = !(postureRegistersBackend(posture) && gpuPresent)`,
where `gpuPresent = detectGpu()` execs `nvidia-smi -L` **on the app container** (`vllm/engine/gpu.ts:7`). In
a co-deployed layout the GPU is passed to the vllm SIBLING, so the app container sees no GPU →
`gpuPresent=false` → **the vLLM backend is not registered even under `adopt-only`**, and the app silently
runs cloud-only. The fix: gate `gpuPresent` on `postureManages(posture)` (i.e. only `adopt-or-start`, the
posture that SPAWNS engines locally and genuinely needs a local GPU). A passive `adopt-only` consumer of a
remote/sibling engine must not require a local GPU. Without this change the co-deployed arm needs the ugly
workaround of installing `nvidia-smi` + exposing the GPU to the app container too.

**Posture:** the app runs **`ENGINES_POSTURE=adopt-only`** (`foundation/env/posture.ts` — passive consumer;
never spawns, never manages auto-sleep). `adopt-or-start` is wrong here: it would try to spawn engines the
slim app image has no vLLM binary for. The vllm container owns the engine lifecycle.

**GPU passthrough (deployment/runtime requirement):** the **vllm** service needs device reservations —
compose `deploy.resources.reservations.devices: [{ driver: nvidia, count: all, capabilities: [gpu] }]` (or
`--gpus all` under `docker run`) — plus the NVIDIA Container Toolkit on the host. The **app** container needs
NO GPU. The vllm container must bind on the service-reachable interface (`--host 0.0.0.0`) for shape (b), not
loopback — that is the vllm container image's own launch config, not the app's `build-argv` (the app doesn't
spawn it under `adopt-only`).

## 4. The container trust model — debug-gate / `isLocalOrigin` / owner-fallback posture (AUTHFIX-2)

This is the section the "designing for everyone" contract lives or dies on.

**The owner fallback in the three SSO modes (local/oidc/forward-header) is origin-gated on the `Host`
HEADER, not the peer IP** (`dispatch.ts:40-70`, `ownerFallbackAllowed` → `isLocalOrigin`). `isLocalOrigin`
returns true when `Host` is `localhost`, in `TRUSTED_LOCAL_HOSTS`, or **parses as an IP in a private range**.
It deliberately reads `Host`, never `X-Forwarded-Host` — "a proxy-rewritten Host can only REMOVE trust,
never grant it" (`dispatch.ts:9-10,47-51`).

**Why this changes in a container, and the concrete exploit if gotten wrong:**

- Behind Caddy, a public request carries `Host: orbweaver.inktomi.tech` → not local → fallback DENIED → SSO
  mandatory. Correct, and it is the intended public posture.
- **The hole:** if the orbweaver container port is reachable OTHER than through Caddy (published to the host,
  or from another container on `inktomi-net`), an attacker connects directly to `orbweaver:8788` and sends
  `Host: 127.0.0.1` (or any `Host: 10.x/172.x/192.168.x`). `isLocalOrigin` → **true** → an un-credentialed
  request is minted a full **owner Principal** for the entire tRPC/API surface. Exact input:
  `GET /api/trpc/... Host: 127.0.0.1` with no cookie → owner. Severity: **critical** (full app as owner, no
  credential).
- **What is NOT exposed by that hole:** `/api/_debug/*`. AUTHFIX-2 (`seam.ts:244-333`,
  `DEBUG_GATE_CREDENTIALED.fallback = false`) makes the origin-gated fallback NOT a credential, so even a
  Host-spoofed owner fallback cannot open the principal-blind whole-db debug reads. The debug gate still
  requires a real admin cookie/JWT or `DEBUG_TOKEN`. Enforcer: `tests/server/entry/debug-gate.suite.test.ts`
  (every AUTH_MODE × Host × token state).

**The secure-default answer (belt AND suspenders):**

1. **The image/compose MUST NOT publish orbweaver's port to the host.** Use `expose: ["8788"]`, never
   `ports:`. Only Caddy reaches it, and Caddy's site-block routes by the real Host, so an anonymous public
   request never carries a private `Host`. This is the primary control and it is a COMPOSE/deploy fact, not
   a code change.
2. **For any public multi-user deployment, recommend `AUTH_FALLBACK=deny`** (fork C). This removes the
   un-credentialed owner path entirely, so even a same-network container that forged `Host: 127.0.0.1`
   gets 401. The owner authenticates via SSO and is elevated by `OWNER_GROUP`/`OWNER_HANDLES` — no loss of
   owner capability. `single-user` ignores `AUTH_FALLBACK` (unconditional), which is exactly why single-user
   must not be public.
3. **`TRUSTED_LOCAL_HOSTS` must NEVER list the public FQDN** (`contract.ts:14`, `env:296-298`). The image
   ships it unset.

**Behavioral change the owner must accept:** the current bare-host deploy gives the owner "owner on the raw
LAN IP (which bypasses caddy)" (`Caddyfile:365-366`) because 8788 is bound on the host and the owner hits
`http://<lan-ip>:8788` with a private `Host`. **A container with an unpublished port LOSES that path** — the
container has no LAN identity to hit. That is the point (it is the same path an attacker would use). The
owner's replacement is SSO login (already live). If the owner insists on keeping raw-LAN owner access, that
is fork C's "keep `AUTH_FALLBACK=owner` + publish the port to the LAN only" arm, with the exposure understood.

**Peer-IP / XFF trust inside the network (secondary, correct-by-default):** because Caddy's peer IP is
private, `resolveClientIp` (`ingress.ts:29-51`) trusts the leftmost `X-Forwarded-For` hop, so `IP_ALLOWLIST`
and per-IP rate limits see the REAL client IP — provided Caddy sets XFF (default). Good. No change needed.

## 5. Secrets & the debug / wire-capture posture for a shipped image

- **`DEBUG_TOKEN`:** UNSET in the image → the entire `/api/_debug/*` surface returns 404
  (`env:158-160`, `debug/routes.ts:208-210`). The live `.env` sets it for card-bug diagnosis; the image and
  its `.dockerignore` must guarantee it is never baked. A deployer opts in explicitly.
- **`WIRE_CAPTURE` / `RPG_TRACE`:** default `off` (`env:164-169`) → the sinks are never wired, turns are
  byte-identical and zero-retention. The image must not set them. When off, `/api/_debug/wire/*` returns `[]`
  by construction even if the gate is open.
- **`SESSION_SECRET` / `OIDC_CLIENT_SECRET` / `CREDENTIALS_KEY`:** env-injected or mounted-secret files,
  never layers. `CREDENTIALS_KEY` is 32 bytes for AES-256-GCM; **losing it makes every stored BYOK credential
  undecryptable** (`.env` warning; `env:338-341`). Two supported arms: supply it as a persistent secret, OR
  set `CREDENTIALS_KEY_AUTO=true` to auto-generate+persist on first boot (requires the data volume to persist).
  Recommend an explicit injected secret for prod. The boot decrypt-probe drives `/healthz` → 503
  `credentials_key_mismatch` if the key stops matching the ciphertext (`healthz.ts:25-27`,
  `lifecycle.ts:226-228`) — a good deploy canary.
- **`EGRESS_FIREWALL`:** keep default ON. It is the SSRF backstop for provider/OIDC egress; the user-influenced
  paths self-enforce regardless (`egress.ts` header). Only add `EGRESS_ALLOWLIST` for a genuinely internal IdP
  JWKS host (§3.4).
- **Security headers / CSP:** owned by the app, env-aware, per-request (`entry/app.ts:153-159`); Caddy must NOT
  duplicate the CSP (the Caddyfile already notes this, `:373`). The image sets `NODE_ENV=production` so the CSP
  drops its dev allowances.

## 6. Compose integration

- **Orbweaver as a real service on `inktomi-net`:**
  ```yaml
  orbweaver:
    image: orbweaver:<tag>            # built from this spec (or build: ./development/orbweaver)
    expose: ["8788"]                  # NEVER ports: — see §4
    env_file: [ ./secrets/orbweaver.env ]   # or docker secrets; AUTH_MODE + the mode's required keys
    volumes: [ orbweaver_data:/app/data ]   # sqlite + CAS + variants
    networks: { inktomi-net: {} }
    healthcheck: { test: node -e "...healthz...", interval: 30s, timeout: 5s, retries: 3 }
    depends_on: { caddy: ..., vllm: { condition: service_healthy } }
    # engine posture (Fork D1): VLLM_ENGINE_HOST=vllm, ENGINES_POSTURE=adopt-only in the env_file
  ```
- **Co-deployed vLLM sibling (Fork D1):**
  ```yaml
  vllm:
    image: <vllm-container-image>          # binds --host 0.0.0.0 so `vllm:<port>` is reachable
    expose: ["8703","8701","8702"]         # gen / embed / rerank (VLLM_*_PORT)
    networks: { inktomi-net: {} }
    deploy:
      resources:
        reservations:
          devices: [{ driver: nvidia, count: all, capabilities: [gpu] }]
    healthcheck: { test: curl -f http://127.0.0.1:8703/health, ... }
  ```
  Requires the NVIDIA Container Toolkit on the host. The app container needs no GPU.
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
  - **C1 (recommended): pure-SSO.** Don't publish the port; `AUTH_FALLBACK` may stay `owner` (Caddy's Host
    gate denies anonymous on the FQDN, and there's no LAN path into the container). Owner logs in via oidc,
    elevated by `OWNER_GROUP`. Loses raw-LAN owner convenience.
  - **C2: keep raw-LAN owner.** Publish `8788` to the LAN interface only and accept that anyone who can reach
    that port + forge a private `Host` is owner (LAN-scoped exposure). Only if the owner wants it.

- **Fork D — engine deployment shape.** vLLM co-deploys as a sibling container; the hardcoded `127.0.0.1`
  (`engine-url.ts:17-20`, `egress.ts:81-83`) is the lever. Two small code changes gate the recommended arm
  (both in §3.6): make `VLLM_ENGINE_HOST` configurable at those two sites, and gate `detectGpu()` on
  `postureManages` so a GPU-less app container still registers a remote engine under `adopt-only`. Three arms:
  - **D1 (RECOMMENDED — matches how the owner runs it): co-deployed vLLM container.** Separate compose
    services on one network; app calls `http://vllm:<port>` with `ENGINES_POSTURE=adopt-only`,
    `VLLM_ENGINE_HOST=vllm`; GPU reserved to the vllm service. Full local GPU inference for the owner's box.
    (Shape (a), shared network namespace, is a sub-variant that keeps `127.0.0.1` and skips the URL change but
    still needs the GPU-gate change.)
  - **D2: external engine URL.** Point `VLLM_ENGINE_HOST` (+ `EGRESS_ALLOWLIST`) at a vLLM/OpenAI-compatible
    endpoint elsewhere. Same lever, no co-located GPU.
  - **D3: engines-off (CPU-only deployer).** `ENGINES_POSTURE=off` — cloud/OpenRouter/agent-sdk models only.
    The right default for a stranger with no GPU; degrades cleanly to no-supervisor (`lifecycle.ts:198-204`).

- **Fork E — production dependency pruning for a source-run TS workspace.** The server runs `.ts` source and
  imports workspace packages as source, so a naive `--prod` install can drop something node needs at runtime,
  while the full install drags in vitest/playwright/stryker. *Recommend `pnpm deploy --filter @orb/server
  --prod` into a self-contained dir* (resolves the workspace graph, prunes dev deps), verified by a boot smoke
  test in the build lane. Fallback arm: carry the full `--frozen-lockfile` install and accept the size. The
  build lane must PROVE the runtime image boots (`/healthz` 200) before this fork is closed.

- **Fork F — pentest cage same-lane or separate.** *Recommend SEPARATE.* The exploit paths in §4 (Host-spoof
  owner fallback when the port is reachable; unsigned forward-header peer gate; the debug gate across modes)
  deserve a live adversarial pass, but that is a verification lane against a running container, not part of
  the image design. The debug-gate suite already encodes the matrix; the cage would exercise the network
  reachability the suite cannot.

## 8. Explicit security assumptions (for review)

- **A1:** Caddy sets `X-Forwarded-Proto/Host/For` by default and its site-block routes strictly by Host, so
  no anonymous public request reaches the app with a private `Host`. If a future catch-all/default site or a
  second ingress bypasses Host-routing, the §4 owner-fallback hole reopens — re-audit on any ingress change.
- **A2:** The orbweaver port is `expose`-only. If anyone adds a `ports:` mapping or another container on
  `inktomi-net` is compromised, the Host-spoof owner path (§4) is live unless `AUTH_FALLBACK=deny`.
- **A3:** `__Host-`/`Secure` cookies assume HTTPS at the browser edge for local/oidc. Plain-HTTP deploys of
  those modes silently fail login — documented, not defended in code.
- **A4:** node 26 TS type-stripping runs the server source as-is in prod; the build lane must confirm no
  `.ts` in the server/kit/contracts/db runtime path needs a transform node 26 does not do natively (e.g. an
  enum/namespace/decorator would need a build step). Verify with a boot smoke test.
