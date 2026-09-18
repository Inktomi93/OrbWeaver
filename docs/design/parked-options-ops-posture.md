---
kind: design
status: parked
updated: 2026-08-14
---

# Parked options — ops + posture cluster (investigate-only)

Owner-facing decision doc for three parked items that were sequenced-after-the-board or are
credential-blocked. **No code was changed producing this.** Each item: current state with
`path:line` receipts, the real options, and a recommendation marked forward-thinking /
do-it-right-once with the WHY.

**Method + coverage.** Read in full: the I-11 block + standing owner items on
`docs/history/retro-workboard-2026-08-14.md`, `docs/barrel-star-reexport-residue.md`, `knip.ts`, both stack
launchers (`scripts/dev/stack.sh`, `scripts/dev/stack-prod.ts`), the only Dockerfile in the repo
(`.devcontainer/Dockerfile` + `init-firewall.sh` + `devcontainer.json`), the deployment topology
(the host stack’s `docker-compose.yaml` and `caddy/conf/Caddyfile` (a separate repository)),
and the agent-sdk backend (`packages/server/src/infra/providers/backends/agent-sdk/**`, esp.
`host-token.ts`). **Not covered:** I did not drive the live stack, did not run any pentest, and did
not read the authentik blueprint config (out of scope). The Caddy/compose facts are from the host
files as they sit today; a prod-launch config could differ.

---

## Item 1 — Containerize (I-11): what is actually left to decide

### Current state (receipts)

**There is NO production container for orbweaver.** The only Dockerfile in the repo is
`.devcontainer/Dockerfile` — a **dev/agent sandbox** (`FROM node:26`, installs claude-code +
ast-grep + the VS Code extensions, bakes Playwright chromium, wires `init-firewall.sh`;
`devcontainer.json:2` names it *"Claude Code Sandbox — orbweaver"*). It is not, and was never, an
app runtime image.

**The app runs bare on the host as the owner's user.** Caddy (in Docker, in the big stack)
reverse-proxies the public domain to the host process:

- `caddy/conf/Caddyfile:370-392` — `@orbweaver host orbweaver.example.com` →
  `reverse_proxy host.docker.internal:8788` with `flush_interval -1` (SSE), a `request_body
  max_size 1GB`, `read_timeout/write_timeout 1800s`, and an `encode` carve-out that **excludes
  `/api/*`** (D118's multiplexed SSE would buffer through `encode` — caddy#6293).
- `docker-compose.yaml:151-152` — Caddy gets `extra_hosts: host.docker.internal:host-gateway` for
  exactly this host-hosted reach. The block's own comment (`:149-150`) calls it a relic of the previous codebase:
  *"drop this once the previous codebase moves into the compose network."*
- The app owns its own auth (Caddyfile:364-366: *"NO forward_auth here … the app owns auth"*), so
  the reverse-proxy is a dumb pass-through — no identity is injected at the proxy.

**The blast radius the board names is real** (`docs/history/retro-workboard-2026-08-08.md:1519-1529`): a file-write or
path-traversal bug in the bare-host process reaches the whole home dir — repo, `.env`, backups,
`~/.ssh`, the vLLM `.models/` weights. The live `.env` sits at repo root readable by that process
and holds real secrets: `OIDC_CLIENT_SECRET`, `DEBUG_TOKEN=…`, `WIRE_CAPTURE=on`, plus the OIDC
issuer/redirect (`.env:25-50`). **Containerizing into a scratch volume is the mitigation** — that
is the whole "the container IS the mitigation" ruling.

**The runtime shape is already container-friendly.** No server build step exists — node 26 runs
`packages/server/src/entry/index.ts` directly via type-stripping (`stack-prod.ts:21`,
`package.json:35` `start`). The ONLY build is the client bundle via `@orb/client`'s own `vite build`
(`stack-prod.ts:303-312`). `stack-prod.ts` already models a production lifecycle (identity-verified
adopt/stop, bounded drain, dist-preflight) — but it spawns a **host** process, not a container.

**The live `.env` is `AUTH_MODE=oidc`, not `single-user`** (`.env:14`). This matters for the
AUTHFIX-2 posture the I-11 block flags: under OIDC the `/api/_debug/*` admin-arm gate keys on
`isLocalOrigin` (the client-supplied `Host` header), not the unconditional single-user fallback.
The board's "prove whether OIDC changes the 200-unauthenticated behaviour" is answerable on this
config, and it is the OIDC arm that is live.

### The fork the brief asked me to resolve: is this a clean Dockerfile lane, or open forks?

**It is NOT a clean mechanical Dockerfile-modernization lane.** "Modernize the Dockerfile" has no
referent — there is no app Dockerfile to modernize, and the dev-sandbox one is a different artifact
with a different job. What I-11 actually needs first is a **design lane** (security-executor-owned
per the ruling) that settles the decisions below. Treating it as "bump the base image" would ship
the wrong thing. The real work is: (a) author a NEW production app image, and separately (b) build
the pentest CAGE — these are two artifacts, and the existing `.devcontainer` is neither.

### Open decisions (each with a recommended arm)

**D1 — Build a production app container at all, or only cage the agent?**
The board frames I-11 as testing-after-containerizing, but the containerization itself is the item.
→ **RECOMMEND: build the prod app image.** It is the mitigation the ruling names; without it the
"scratch volume" reach-reduction never happens and the pentest measures a posture that was supposed
to be replaced. Do-it-right-once: the app image is the durable artifact; the pentest is a one-time
event against it.

**D2 — Image shape / base.**
→ **RECOMMEND: multi-stage, `node:26` to match `.nvmrc` + the devcontainer.** Builder stage: `pnpm
install --frozen-lockfile` + `pnpm --filter @orb/client build`. Runtime stage: a slim `node:26`
(-slim, not distroless — the app shells out to system binaries; see `knip.ts:47-73` ignoring `ss`,
`ps`, `nvidia-smi`), **non-root user**, copy source + pruned prod `node_modules` + `packages/client/dist`,
entrypoint `NODE_ENV=production node packages/server/src/entry/index.ts` (the existing `start`
script). No server transpile — keep the type-stripping runtime.

**D3 — What goes in the container vs stays on the host.**
→ **RECOMMEND:**

- **vLLM fleet STAYS on the host** — GPU-bound, ~34GiB/card, weights under `.models/` (memory:
  vllm-sleep-fleet-facts). The container reaches it via `host.docker.internal`/host-gateway. Fleet
  ports are 8701/8702/8703 (`stack.sh:100`) plus the compose comment's host `:8081`
  (`docker-compose.yaml:540-541`). Enumerate exactly which the app dials and allow only those.
- **The SQLite `data/` dir + asset CAS + import bundles → a named volume** (the scratch-volume that
  makes a traversal bug non-catastrophic). This is the mitigation's teeth.
- **Secrets → explicit `environment:` mapping**, the pattern the compose already uses for authentik
  (`docker-compose.yaml:286-311` deliberately avoids `env_file: .env` so it doesn't hand every
  stack secret to one service). Do NOT bind-mount repo-root `.env` into the container.

**D4 — Compose service vs standalone container, and the Caddy seam.**
→ **RECOMMEND: add orbweaver as a service on `inktomi-net`** and repoint Caddy from
`host.docker.internal:8788` to `http://orbweaver:8788` (`Caddyfile:385`). This retires the
`extra_hosts` relic the compose file itself flags for removal (`docker-compose.yaml:149-150`) and
puts orbweaver behind the same CrowdSec/rate-limit/TLS spine as every sibling. **Preserve verbatim**
when repointing: `flush_interval -1`, the 1800s timeouts, the 1GB body cap, and the
`not path /api/*` encode carve-out (all load-bearing — SSE + uploads). Note it still owns its own
auth (no `forward_auth`), same as grafana/forgejo in the same file.

**D5 — The pentest CAGE is separate work, and the dev sandbox is the WRONG starting point.**
The I-11 ruling wants the testing agent boxed on its own bridge network, egress-allowlisted to
exactly the target `ip:port`, no repo mount, pinned `/etc/hosts`, positive controls both ways. The
existing `init-firewall.sh` does the OPPOSITE of what a pentest cage needs: it allowlists
`registry.npmjs.org`, `api.anthropic.com`, `cdn.playwright.dev`, GitHub's whole meta range, and the
**entire host `/24`** (`init-firewall.sh:90-133`) — i.e. it opens the LAN, which is exactly what the
cage must prove it CANNOT reach.
→ **RECOMMEND: purpose-build the cage, don't adapt the devcontainer.** A minimal image whose
firewall default-denies and allows ONLY the target, with the two-way positive-control probe baked
in (prove it CANNOT reach the LAN/vLLM/docker-socket AND CAN reach the target — else "no findings"
is unfalsifiable, the four-instruments-lie law applied to the fence). This is a security-executor
deliverable; the app image (D1-D4) can land first and independently.

**D6 — Burn the known debt BEFORE the pentest so findings are news.** Per the I-11 list
(`docs/history/retro-workboard-2026-08-08.md:1533-1539`): the AUTHFIX-2 `/api/_debug/*` hole
(`docs/architecture/core/Core-Audits-and-Debt.md`; the fix is lane DEBUGGATE, already dispatched
per the STATE block), `DEBUG_TOKEN`/`WIRE_CAPTURE` armed in live `.env`, secrets at repo root, the
1GB body upload surface. These are pre-conditions, not pentest findings.

**Sequencing recommendation:** (1) app image D1-D4 as one design-then-build lane →
(2) repoint Caddy + compose service, verify SSE/uploads survive the network change →
(3) burn D6 debt → (4) security-executor builds the D5 cage and runs the pentest against the
prod-shaped clone on an offset port (the `stack.sh` offset-port machinery already supports a second
stack — `STACK_RUN_DIR`/`VITE_PORT`/`PORT`, `stack.sh:66-88`). Steps 1-3 are ordinary lanes; only
step 4 is security-executor-exclusive.

---

## Item 2 — `--include-entry-exports` (knip whole-repo posture)

### Current state (receipts)

knip is on maximal posture — every issue type `error`, member-level, config-hints-as-errors
(`knip.ts:14-35`). Its unused-export lens is **live and proven in both workspaces** but is
**structurally blind to barrel entry files**: an export imported by nothing but re-exported through
an `index.ts` entry is invisible, because knip excludes entry-file exports from unused-export
reporting (`barrel-star-reexport-residue.md:46-59`, two-sided planted-probe receipt). Every package
declares its barrels as entries (`knip.ts:61-82`, the `!` production markers).

The barrel lane already derived the consequence: **135 names are re-exported by a barrel no consumer
imports through** — Tier A **85** (reachable by nothing; dropping the barrel line makes them dead
code), Tier B **50** (alive via a direct sibling import; only the barrel line is surplus)
(`barrel-star-reexport-residue.md:92`, full enumeration §4). That worklist is HELD as the
"135-name barrel amputation" lane, explicitly waiting for a quiet tree
(`docs/history/retro-workboard-2026-08-08.md:2452-2456`).

`--include-entry-exports` is **the one lever that makes barrels knip-legible**
(`barrel-star-reexport-residue.md:68-71`): it would surface the Tier-A worklist automatically —
*and* every other entry export across all five workspaces at once. That is the noise-vs-value
tradeoff that made it an owner ruling, not a lane default.

### Options

- **(a) Enable repo-wide NOW.** Pro: the ~85 Tier-A names surface mechanically and future barrel rot
  is auto-caught. Con: it floods the current findings — every legitimate entry export across all
  five packages reports at once, on top of the 85, before the amputation lands. A noise cliff on a
  tree that hasn't done the surgery yet.
- **(b) Leave it off.** The manual worklist in the barrel doc is the surgical substitute; the
  amputation lane consumes it directly. Con: no automatic guard against the NEXT barrel accreting a
  dead re-export — the rot lens stays manual forever.
- **(c) Enable AFTER the amputation lands.** Sequence it: the amputation clears the 85 Tier-A names
  (each gets an individual verdict — delete / `/** @public */` / header-cite, per the doc's warning
  that several are law-protected shape data, `barrel-star-reexport-residue.md:83-90`), THEN flip the
  flag on a tree where the remaining entry exports are all genuinely public.

### Recommendation — **(c), enable after the amputation. Forward-thinking / do-it-right-once.**

The do-it-right-once order is: **surgery first, then the standing guard.** Enabling now (a) buries
the 85 real findings under hundreds of legitimate-entry-export lines, which is precisely the
noise-cliff that makes a new gate get ignored. Leaving it off forever (b) means barrel hygiene never
becomes automatic — the exact "convention instead of a gate" failure the barrel doc warns about for
the db schema case (`barrel-star-reexport-residue.md:39-44`).

Sequence: (1) run the held amputation lane on a quiet tree, resolving each Tier-A name to
delete/`@public`/cite and dropping the surplus Tier-B barrel lines; (2) once the tree is clean,
enable `--include-entry-exports` repo-wide — now every remaining entry export is a deliberate
`/** @public */` surface, so the flag reports only real regressions going forward. That converts
barrel hygiene from a periodic manual sweep into a standing gate **without** the noise cliff, which
is the whole point of doing it in this order.

Caveat worth stating to the owner: `--include-entry-exports` also lights up the two **sanctioned**
db schema stars (`barrel-star-reexport-residue.md:23-44`) — those are gate-required and must be
kept (via `/** @public */` or the existing header cites), not "cleaned up." The amputation lane
already knows this; a naive post-flag sweep would not.

---

## Item 3 — AGENT-1 (owner-scoped, "Max OAuth expired")

### What AGENT-1 actually IS (receipts)

Two related board entries, same subject:

- Standing owner item #7 (`docs/history/retro-workboard-2026-08-08.md:1989-1996`): **agent-sdk first-class for rpg-lite.**
  Plumbing is ~complete; four remaining arms in **ruled order 2→3→1→4** — (2) reasoning-visibility
  parity, (3) usage/context accounting parity, (1) knob honesty, (4) the live rpg-lite loop scored
  on the SDK wire. Closes: *"Claude Max OAuth expired — the agent-sdk backend is dead until he
  re-auths."*
- `AGENT-1-PROGRAM` (`docs/history/retro-workboard-2026-08-08.md:1844-1845`): *"agent-sdk first-class for rpg-lite, 5 named
  arms explicitly scoped-and-not-dispatched, ruled order 2→3→1→4."*
- The overnight full-auto block (`docs/history/retro-workboard-2026-08-08.md:427-430`) lists it under **WILL NOT AUTO-BUILD — owner-gated**:
  "AGENT-1 (owner-scoped, Max OAuth expired)."

**The plumbing is real, not aspirational** — the agent-sdk backend is a full subsystem:
`packages/server/src/infra/providers/backends/agent-sdk/` carries `agent-runner.ts`, `session/`
(frames + store, session resume), `terminal-tools.ts`, `output-schema.ts`, `catalog.ts`,
`verify-auth.ts`, `host-token.ts`, `summarize.ts`, `translate.ts`, `env.ts` (24 files). It is wired
into role dispatch: `roles/dispatch.ts:82` — *"the max-pro-sub credential is reachable only through
the agent-sdk api"*; `roles/firewall.ts:13,17,46-47` — the `max-pro-sub` owner-consent gate.

**"Max OAuth expired" is a real, specific, credential-level wall — not a code gap.** The backend
authenticates the Claude Max subscription via the host's `~/.claude/.credentials.json` OAuth token
(`host-token.ts:4,59`). It proactively refreshes an expiring **access** token before spawn — BUT
only if the **refresh** token is still valid: `needsRefresh` returns `false` when
`refreshTokenExpiresAt <= now` (`host-token.ts:85-87`). So once the refresh token itself expires,
the code correctly gives up and there is **no in-app remedy** — the fresh credential can only come
from the owner re-authenticating on the host (a `claude` login / setup-token flow that rewrites
`~/.claude/.credentials.json`). The OAuth client is the CLI flow, pinned to
`platform.claude.com/v1/oauth/token` (`host-token.ts:14-17`).

### Buildable-without-the-cred vs blocked-on-it

- **Buildable now (no live credential needed):** arms (1) knob honesty, (2) reasoning-visibility
  parity, (3) usage/context accounting parity. These are about how OUR code shapes and reports the
  SDK wire — the encrypted-vs-readable reasoning delta handling, per-turn usage delta semantics, and
  honest treatment of sampling knobs the SDK wire ignores (`docs/history/retro-workboard-2026-08-08.md:1989-1996`). Their
  UNIT/CT proofs run against recorded/mocked wire shapes; they do not require a live Max turn. The
  OpenRouter arm of the reasoning-parity work is exercisable with an OpenRouter credential (a
  different, non-expired path — `roles/firewall.ts:17` lists `openrouter` for the agent role).
- **Blocked on the credential:** arm (4), the **live rpg-lite loop scored on the SDK wire** — by
  construction a live drive against the Max sub, so it cannot be verified until the owner re-auths.
  Any end-to-end "does agent-sdk mode demonstrably work" verification is in this bucket (same class
  as the NARRATOR-LIVE hosted-arm blockage, `docs/history/retro-workboard-2026-08-08.md:322-352`).

### Recommendation

**Split it. The credential is an owner action, not a lane; three of the four arms are a buildable
lane that does not need it.**

1. **Owner action (not dispatchable work):** re-authenticate the Claude Max subscription on the host
   (`claude` login / setup-token → rewrites `~/.claude/.credentials.json`). This is the "renew the
   OAuth" step. Purely credential-blocked; no code closes it (the refresh code is already correct and
   already fails safe). State it plainly on the board as an owner op, the same shape as the standing
   "rotate `DEBUG_TOKEN`" / "`.env` OpenRouter key is inert" owner ops.

2. **Buildable lane (dispatch when the queue has room):** arms 1-3 in the ruled order (2→3 then 1),
   built and unit/CT-proven against recorded SDK wire shapes + the OpenRouter arm. Do-it-right-once:
   these are the honest-accounting arms (reasoning deltas, usage deltas, knob honesty) — the exact
   "features that looked done and silently weren't" risk the north-star exists to kill, so they want
   real wire-shape proofs regardless of the live credential. Building them now means that the moment
   the owner re-auths, only arm 4 (the live loop) remains, and it is a verification drive rather than
   a build.

The board currently lumps all of AGENT-1 under "owner-gated, do not auto-build." That is right for
arm 4 and for the credential, but arms 1-3 are ordinary buildable work whose only dependency is a
dispatch slot — worth surfacing to the owner as "three of these do not wait on your OAuth."
