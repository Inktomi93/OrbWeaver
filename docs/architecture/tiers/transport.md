# Orbweaver — `transport` (trpc · jobs): the thin drivers at the request edge

> **Status: planning (authoritative detail).** `transport` is the DRIVER tier — the thin layer that
> validates/sequences a request and delegates DOWN into domain front doors. It owns nothing the
> domains own: a router is "validate input → call `ctx.services.<feature>.<verb>` → map the typed
> domain error to a wire code," and a job worker is "decide which row / when → call the workloads
> front door." Two real drivers live here: **trpc** (the router tree + context builder + the
> procedure ladder + rate-limit middleware + error-mapping) and **jobs** (the workloads poll loop +
> the catalog-refresh scheduler). The headline reconciliation: the **non-tRPC HTTP registrars
> (`http/`) are NOT a transport driver — they tier under `entry/http/`** because they wire
> domain+infra+the auth seam together (composition), which is above `domain-no-cross-feature`; only
> `entry/` may cross feature front doors. The other cross-feature builders neo-tavern parked in
> `jobs/` (`workloads-env.ts`, `buddy-env.ts`) move to `entry/compose/runner-env.ts` (per
> DECISIONS-LEDGER §7 D4) for the same reason. Authoritative
> upstream: `structure.md` §3 (server tiers — `transport` is `trpc/` + `jobs/`, `http/` is under
> `entry/`; drivers are THIN, call DOWN into front doors only), §7 (the six gates); `_FANOUT-BRIEF.md`
> §2 (one-directional flow), §3 (placement rule), §8.1 (coupling already clean — zero cross-feature
> deep imports, zero domain→transport edges); `reports/shared-dissolution.md` §6
> (`_shared/rate-limit.ts` → `transport/rate-limit`); `domains/workloads.md` (the worker is
> transport/jobs, the domain owns the engine, `buildWorkloadsEnv` is `entry/`);
> `domains/credentials.md` + `domains/sessions.md` (the `Principal` is built at the `entry/` seam —
> transport CARRIES it); `domains/assets.md` / `domains/import.md` / `domains/connection.md` (where
> each route/router delegates).

---

## What this tier owns

- **The tRPC router tree** — `appRouter` (`transport/trpc/router.ts`) mounting one thin router per
  domain (`routers/<feature>.ts`) plus the loose public/authed procedures (`health`, `echo`,
  catalog browse, OpenRouter account surfaces). Every procedure is `validate (zod) → call
  ctx.services.<feature>.<verb> → let the typed domain error map to a wire code`. **Zero business
  logic, zero db/provider/infra access.**
- **The procedure ladder + middleware** (`transport/trpc/trpc.ts`) — the single `initTRPC` init and
  the `publicProcedure → authedProcedure → adminProcedure` rungs, built ONCE, each picking a stricter
  gate. The middleware stack (in order): per-procedure tracing span, domain-error→tRPC mapping,
  rate-limit gates, the auth+CSRF gate, the admin gate. `adminProcedure`/`adminMiddleware` is
  transport's **layer-1** authority gate (the domain's `requireAdmin` is layer-2).
- **The tRPC context builder** (`transport/trpc/context.ts`) — packages the entry-built `Principal`,
  the `Services` bundle, the rate-limiters, and `clientIp` into the per-request `Context` the ladder
  reads. Pure packaging: **no db, no header parsing, no identity resolution** (that is the `entry/`
  seam).
- **The error-mapping classifier** (`transport/trpc/error-mapping.ts`) — `classifyDomainError`: a
  pure function mapping each `@orb/kit/errors` `DomainError` subclass to a tRPC code via a `.cause`
  walk. Testable without standing up the ladder.
- **The rate-limit primitive + middleware** — `transport/rate-limit.ts`
  (`createRateLimiter`/`RateLimiter`/`RateLimitConfig`, the DB-backed multi-replica limiter, dissolution
  §6) and `transport/trpc/rate-limit.ts` (the `enforce{Request,Authed,Public}RateLimit` helpers +
  the `AI_TURN_PATHS` set). The limiter is the request gate; the `DomainRateLimitError` it throws is
  mapped to `TOO_MANY_REQUESTS` + `Retry-After` downstream.
- **The in-server job drivers** (`transport/jobs/`) — the **workloads worker** (poll loop / claim /
  wake-on-emit / periodic reap tick / graceful-shutdown abort) and the **catalog-refresh scheduler**
  (the when-to-enqueue recurring driver). Both call DOWN into the `workloads` front door only and
  cross ZERO feature boundaries.
- **The per-user notifications subscription + the presence registry** (the unified multi-human system,
  `domains/chat.md` Part III §3–§4 + ledger D16). (a) The **notifications subscription**
  (`authedProcedure.subscription` filtered to the caller) drives the per-user durable inbox owned by the
  **`notifications` domain** — it adopts the **`chat.streamMessages` resume shape** (every yield `tracked()`,
  `lastEventId` replay; durable-first/fan-out-second), **NOT `buddy.stream`** (in-memory ring, drops offline
  events). It carries invite/kick/handoff to non-members the per-chat bus can't reach. Transport owns only
  the *subscription* (the durable table + verbs are the `notifications` domain). (b) **Presence** is
  transport state: an **SSE connection ref-count per `userId`** (across devices, debounced/grace-windowed),
  the **only** liveness source (server-observed, never a client-asserted heartbeat — spoofable presence is a
  prompt-composition attack). Exposed DOWN to chat as an injected `presence.read` op for cast-gating.

## What this tier does NOT own

- **The `Principal` construction / the auth seam** — `createAuthResolver`/`resolveOwner` (today
  `server/auth-context.ts`) move to `entry/auth/seam.ts`. Identity is resolved ONCE at the edge into
  one immutable `Principal` (`sessions.md` §7.1); transport **carries** it on `ctx`, never builds it.
- **The non-tRPC HTTP registrars** — `assets`/`import`/`export`/`health`/`auth-meta` registrars are
  `entry/http/*` (`structure.md` §3), NOT transport. They wire a domain + infra (`cas`/`variants`/
  `sharp`) + the auth seam together — cross-feature composition, an `entry/` concern above
  `domain-no-cross-feature`. (RESOLVED → `entry/http/`; see §Resolved decisions.)
- **The cross-feature env builders** — `buildWorkloadsEnv` (`WorkloadRunnerEnv`) and the buddy
  agent/observer envs lived in neo-tavern's `jobs/` but cross EVERY feature boundary; they are
  `entry/compose/runner-env.ts` (per DECISIONS-LEDGER §7 D4 — the type stays in
  `domain/workloads/contract`). `workloads.md` already states this — transport/jobs must not reach
  sideways into features.
- **The bulk-import driver** — `importCollectedProfile` (store-then-import glue across import+assets)
  is `entry/import/run-profile-import.ts`, shared by the zip route and the `import-st` runner
  (`import.md`).
- **Business logic of any kind** — the workloads engine (`runWorkload`/dispatch/reaper/progress-bus)
  is the `workloads` DOMAIN; the router-validated verbs are the domains'. Transport sequences and
  delegates.
- **The rate-limiter INSTANCES** — `createRateLimiter(db, cfg)` is invoked at the `entry/`
  composition root (db is required at construction) and threaded onto `ctx`; the primitive's
  definition is the transport file, the construction is entry's.

---

## The driver-vs-composition line (what decides a unit's tier)

The one rule that sorts every unit in this survey:

| If a unit… | …it is | …and lives in |
|---|---|---|
| validates+sequences and calls DOWN into ONE domain front door (crosses zero feature boundaries) | a **thin driver** | `transport/` |
| wires TWO+ domain front doors, or a domain + infra + the auth seam, together | **composition** | `entry/` |

A tRPC router (one `ctx.services.<feature>`) and the workloads worker (one `domain/workloads` front
door) are thin drivers → transport. An asset-upload route (assets domain + `cas` infra + the
auth-seam CSRF guard), an import-zip route (import domain + assets domain), the `WorkloadRunnerEnv`
builder (every feature) are composition → entry. The neo-tavern `src/server/http/` and the env
builders in `src/server/jobs/` are composition that was mis-parked one tier too low; orbweaver lifts
them to `entry/`.

---

## Internal layout

```
transport/
├── rate-limit.ts              the DB-backed limiter PRIMITIVE — createRateLimiter / RateLimiter /
│                                RateLimitConfig (dissolution §6). Multi-replica-correct (replaces the
│                                in-proc RateLimiterMemory + the local-login Map). The now() clock seam
│                                is its ONLY impurity. INSTANCES are constructed at entry/ (db-backed),
│                                threaded onto ctx.rateLimit.
└── trpc/
    ├── trpc.ts                initTRPC + the procedure ladder (public → authed → admin) built ONCE.
    │                            Middleware stack: tracing span → domain-error map → rate-limit gate →
    │                            auth+CSRF gate → admin gate. adminProcedure = layer-1 authority.
    ├── context.ts             Context type + createContext — packages the entry-built Principal +
    │                            Services + rate-limiters + clientIp. Pure packaging (no db/auth).
    ├── error-mapping.ts       classifyDomainError — pure: kit DomainError subclass → tRPC code,
    │                            via a .cause walk. Tested in isolation.
    ├── rate-limit.ts          enforce{Request,Authed,Public}RateLimit + AI_TURN_PATHS (the middleware
    │                            helpers; no `t` import → no cycle). securityEvent on every throttle.
    ├── router.ts              appRouter — mounts routers/<feature> + the loose public/authed procs
    │                            (health, echo, catalog browse, OR account surfaces, testClaudeAuth).
    └── routers/               ONE thin router per domain — each delegates to ctx.services.<feature>.
        ├── chat.ts            send/swipe/start/… + streamMessages (the SSE subscription)
        ├── workloads.ts       start/cancel/retry/get/list + subscribe (admin-gated; SSE)
        ├── credentials.ts     per-user CRUD + testHealth + inspectEndpoint (authed; admin for host-Claude)
        ├── search.ts          search/images + fields/suggest (→ search domain after the rewire)
        ├── corpus.ts          read-side analytics + the embed write (→ discovery/embeddings owners)
        └── …                  character · persona · preset · settings · stats · tag · user-admin · world-info · buddy
└── jobs/
    ├── workloads-worker.ts    the DRIVER: poll → nextRunnableWorkload → runWorkload → reap tick →
    │                            wake-on-emit → SIGTERM-aborts-the-run. Enters domain/workloads via
    │                            its front door ONLY; crosses zero feature boundaries.
    └── catalog-refresh-scheduler.ts  the when-to-enqueue recurring driver — workloads.list/.start
                                 through the front door; swallows the single-active conflict as the goal.

# NOT transport (composition → entry/, per structure.md §3 + the domain docs):
entry/http/{assets,import,export,health,auth-meta}.ts   non-tRPC registrars (binary/multipart/healthz)
entry/auth/seam.ts                                       createAuthResolver/resolveOwner → the Principal
entry/import/run-profile-import.ts                       the bulk store-then-import driver
entry/compose/runner-env.ts                              the cross-feature WorkloadRunnerEnv + buddy envs (per §7 D4)
entry/app.ts                                             the Hono builder + the tRPC fetch-handler mount
                                                          (createContext seam + onError + the Retry-After responseMeta)
```

---

## Movement table

| Unit (neo-tavern) | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `trpc/trpc.ts` — `initTRPC`, the procedure ladder, all middleware | **stays a driver** | `transport/trpc/trpc.ts` | The thin gate ladder; reads the resolved `ctx.auth`/`Principal`, never touches db/auth itself (the layer cake). | resolve-time: `transport` may import only `domain/*` front doors + `transport/rate-limit`; dep-cruiser `drivers-through-domain` backstop |
| `trpc/context.ts` — `Context`, `createContext`, `Services`, `AuthContext`, `RateLimiters` | **stays a driver, reshaped** | `transport/trpc/context.ts` | `AuthContext` + `Context.{userId,role}` collapse into the entry-built `Principal` (§7.1); `Services` keeps its front-door type imports; `RateLimiter` import re-points to `transport/rate-limit`. Pure packaging. | resolve-time (front-door type imports); compile-time (`Principal` is the one identity shape) |
| `trpc/error-mapping.ts` — `classifyDomainError` | **stays a driver** | `transport/trpc/error-mapping.ts` | Pure `DomainError → tRPC code` classifier; the central consumer of the kit error classes. The `.cause` walk survives arbitrary wrapping. | resolve-time (imports `@orb/kit/errors`); test-time (one case per subclass) |
| `domain/_shared/errors.ts` — `DomainError` + 7 subclasses (consumed by error-mapping) | **→ kit** | `@orb/kit/errors` | Pure error base classes; `DomainNotFoundError` is boot-critical (front-door re-exports). Dissolution §1. | resolve-time |
| `domain/_shared/rate-limit.ts` — `createRateLimiter`/`RateLimiter`/`RateLimitConfig` | **→ transport** | `transport/rate-limit.ts` | The DB-backed limiter is the transport gate's primitive (dissolution §6). Constructed at `entry/` (db), threaded via ctx. | resolve-time (dissolution §6 LOCKED); see Open decisions for the db-import tier note |
| `trpc/rate-limit.ts` — `enforce{Request,Authed,Public}RateLimit`, `AI_TURN_PATHS`, `RateLimitCause` | **stays a driver** | `transport/trpc/rate-limit.ts` | The middleware helpers (no `t` import → no cycle); the AI-turn path set is transport's $/GPU-aware gate. | resolve-time; §7.5 `no-inline-union-redecl` (the path set tracks chat verb names) |
| `trpc/router.ts` — `appRouter` + the loose procs (`models`/`rawModels`/`orCredits`/…) | **stays a driver, re-pointed** | `transport/trpc/router.ts` | `models.*` re-points to `ctx.services.connection.*` (connection absorbs models); each loose proc stays a front-door delegation (`drivers-through-domain` — the router never reaches `providers/`). | resolve-time (front-door only); dep-cruiser `drivers-through-domain` |
| `trpc/routers/<feature>.ts` (16 routers) | **stays a driver** | `transport/trpc/routers/<feature>.ts` | One thin router per domain; validate → `ctx.services.X` → map errors. Wire schemas derive from the domain tuples (e.g. `z.enum(WORKLOAD_STATUSES)`, `z.enum(CRED_PROVIDERS)`, `chatApiSchema`). | resolve-time + §7.4/§7.5 (no inline union re-spelling) |
| `trpc/routers/search.ts` — `fields`/`suggest` calling `ctx.services.corpus.fieldSearch`/`fieldSuggest` | **re-wired** | `ctx.services.search.fields`/`search.suggest` | The search domain owns lexical/field search post-split; the search router stops cross-reaching into corpus. `corpus.fieldSearch`/`fieldSuggest` are DELETED (search.md). | resolve-time (the verb moves owners); the router re-points |
| `trpc/routers/corpus.ts` (read procs + `embed`) | **stays a driver, re-pointed** | `transport/trpc/routers/corpus.ts` (or `discovery.ts`) | Read analytics procs re-point to `ctx.services.discovery.*` (corpus→discovery rename); `embed` re-points to `ctx.services.embeddings.*` (the one write path). Thin delegations throughout. | resolve-time (front-door only) |
| `jobs/workloads-worker.ts` — poll loop / reap tick / wake-on-emit / shutdown | **stays a driver, re-tiered** | `transport/jobs/workloads-worker.ts` | THE workloads driver — calls `nextRunnableWorkload`/`runWorkload`/`reapOrphanedWorkloads`/`loadWorkload` through the front door; crosses zero feature boundaries. | resolve-time (front-door only); dep-cruiser `drivers-through-domain` |
| `jobs/catalog-refresh-scheduler.ts` — when-to-enqueue | **stays a driver, re-tiered** | `transport/jobs/catalog-refresh-scheduler.ts` | A recurring driver; `workloads.list`/`.start` through the front door, swallows the single-active `DomainConflictError` as the desired end state. The snapshot itself is the `refresh-model-catalog` runner calling `connection.refreshCatalogSnapshot`. | resolve-time (same tier rule) |
| `jobs/workloads-env.ts` — `buildWorkloadsEnv` | **→ entry**, re-partitioned | `entry/compose/runner-env.ts` (per §7 D4) | Crosses EVERY feature boundary (embeddings/discovery/memory/assets/import/stats/connection) — an `entry/` concern, above `domain-no-cross-feature`. NOT transport (a driver must not reach sideways). Matches `workloads.md`; the type stays in `domain/workloads/contract`. | resolve-time: only `entry/` may import multiple domain front doors; a `transport/`-located cross-feature build fails the tier rule |
| `jobs/buddy-env.ts` — `buildBuddyAgentEnv` / `buildBuddyObserverEnv` | **→ entry** | `entry/compose/runner-env.ts` (per §7 D4) | Bridges `domain/buddy` ↔ `domain/workloads`/`domain/chat` event sources — cross-feature composition (the buddy doc's seam). NOT transport. | resolve-time (entry only) |
| `http/assets.ts` — blob serve + upload registrars | **→ entry** | `entry/http/assets.ts` | Wires `assetsService` (domain) + `cas`/`variants` (infra) + `resolveOwner` (auth seam) — composition, not a thin driver. (`assets.md` movement.) | resolve-time: `entry/` is the topmost tier (downward imports OK) |
| `http/assets.ts` — the `?w=&f=webp` snap+variant-cache+`sharp` block | **split: policy → domain, sharp → infra** | `domain/assets/verbs/resolve-variant.ts` injecting a `sharp` infra adapter | Width-snap is domain policy; `sharp` is CPU/I/O infra. Keeps the route thin and `sharp` out of `entry/`. (assets.md open item.) | resolve-time (sharp behind an infra adapter) + lint (no `sharp` in `entry/` if extracted) |
| `http/import.ts` — `/api/import/{cards,chats,zip}` | **→ entry** | `entry/http/import.ts` | Wires `domain/import` + `domain/assets` (the card PNG is the avatar) + the auth seam — composition. | resolve-time (entry only) |
| `http/import.ts` — the zip bulk loop (`collectBundlesFromDir`→`importCollectedProfile`) | **→ entry, unified** | `entry/import/run-profile-import.ts` | The store-then-import glue is shared by the zip route AND the `import-st` runner — one composition helper, not two bulk loops. (import.md "bulk-loop unification".) | resolve-time (only `entry/` imports two domain front doors) |
| `http/import.ts` — inline `isPng` (3rd copy) | **→ kit** | `@orb/kit/png-card-chunk` | Dedupe with the codec's `isPng`. Dissolution §1. | resolve-time |
| `http/export.ts` — character PNG / chat JSONL downloads | **→ entry** | `entry/http/export.ts` | One domain (`export`) + the auth seam; safe GET → no CSRF. A thin-ish driver, but the `register<X>Routes` discipline + the auth-seam wiring make it route-tier (entry). | resolve-time (entry) |
| `http/health.ts` — `/api/healthz` | **→ entry** | `entry/http/health.ts` | Readiness probe — reads `isShuttingDown()` (lifecycle) + `allEngineStatuses()` (providers/infra). Route-tier; no domain at all. | resolve-time (entry) |
| `http/auth-meta.ts` — `/api/auth/{config,me}` | **→ entry** | `entry/http/auth-meta.ts` | The bootstrap chicken-and-egg endpoints the tRPC client can't bootstrap itself with; they go through the same `authResolver`. Route-tier (entry), deliberately NOT tRPC. | resolve-time (entry); documented "stay Hono" invariant |
| `auth-context.ts` — `createAuthResolver`, `resolveOwner`, `AuthResolver`, `OwnerResolution` | **→ entry (the seam)** | `entry/auth/seam.ts` | The ONE place that wires `infra/auth` (verification) + `domain/sessions` (resolution/upsert) → the immutable `Principal`. Transport CARRIES the result, never builds it. (sessions.md.) | resolve-time (`entry/` only) |
| `app.ts` — `createRateLimiter(db, …)` instances + the `responseMeta` Retry-After mapping | **→ entry** | `entry/app.ts` | Limiter construction needs db (composition root); the tRPC fetch-handler mount (createContext seam + onError + responseMeta) is the Hono builder's job. The Retry-After mapping reads `DomainRateLimitError` fields (the transport error class). | resolve-time (entry has db); the error class is transport/kit |

---

## Cross-tier composition (the front-door rule)

Transport sits ABOVE domain and imports a domain's **`index.ts` only** — never a deep import into a
domain's `verbs/`, `persistence/`, `engine/`, or `runners/`, and never `infra/` directly (go through
a domain front door, or up to `entry/`). `_FANOUT-BRIEF.md` §8.1 confirms this is already true in
neo-tavern: **zero cross-feature deep imports, zero domain→transport edges**; the routers are 100%
front-door.

**Every tRPC router → its one domain front door:**

| Router | Front door it enters | Surface used |
|---|---|---|
| `routers/chat.ts` | `#server/domain/chat` | the `ChatService` verbs + `chatStreamEmitter`/`getRecentChatEvents`/`ChatNotFoundError` for the SSE subscription |
| `routers/workloads.ts` | `#server/domain/workloads` | the `WorkloadService` verbs + `getRecentWorkloadEvents`/`workloadStreamEmitter` + the `WORKLOAD_STATUSES`/`WORKLOAD_KINDS` tuples + `StartWorkloadInput` |
| `routers/credentials.ts` | `#server/domain/credentials` (+ `connection` for host-Claude verify) | the per-user CRUD/health/inspect verbs; `CRED_PROVIDERS` from `@orb/contracts` for the wire enum |
| `routers/search.ts` | `#server/domain/search` | `search`/`images`/`fields`/`suggest` (post-rewire — no more corpus cross-reach) |
| the loose procs in `router.ts` | `#server/domain/connection` | `models`/`rawModels`/`orCredits`/`orActivity`/`orProviders`/`testClaudeAuth` (routed through the domain so the driver never touches `providers/` — the `drivers-through-domain` rule, cited in-code) |

**The job drivers → the workloads front door (no internals touched):**

| Driver | Surface used | For |
|---|---|---|
| `transport/jobs/workloads-worker.ts` | `nextRunnableWorkload`, `runWorkload`, `reapOrphanedWorkloads`, `loadWorkload`, `workloadStreamEmitter` | the poll/dispatch/reap/wake loop. The engine entry points are deliberately ON the workloads front door (workloads.md) precisely so this driver enters legally. |
| `transport/jobs/catalog-refresh-scheduler.ts` | `createWorkloadService` → `list` + `start` | the daily `refresh-model-catalog` enqueue decision |

**What transport must NOT do (RED):**

- A router importing `domain/<feature>/verbs/X` or `domain/<feature>/persistence/` — deep import.
- The worker importing `domain/workloads/engine/runner` directly instead of via `index.ts`.
- Any transport file importing `infra/providers`/`infra/storage` directly (the `models` loose proc
  comment documents the in-code workaround: route through the domain).
- Any transport file importing TWO domain front doors (that is composition → it belongs in `entry/`).
- The `Principal`/identity resolved in transport (it is carried from the `entry/` seam).

The `adminProcedure` gate is transport's **layer-1** authority check; the matching `requireAdmin`
inside the admin-touching domain verbs is **layer-2** (admin.md — defense in depth). A driver gate is
not a substitute for the domain check.

---

## Spine thread intersections

### §7.1 identity / auth / permission

The `Principal` is resolved ONCE at the `entry/auth/seam.ts` edge and flows down immutable; transport
**carries** it on `ctx` and gates on plain fields — `authMiddleware` checks `Principal.identity !==
null` (else 401), `adminMiddleware` checks `can(p,'admin',global)` (= **owner ∪ admin**, D17; else 403,
with a `securityEvent("admin_required", …)` audit line). No db round-trip in the gate (the role was
resolved at the seam). Every denial (`auth_required`, `csrf_rejected`, `rate_limit`, `admin_required`)
emits a `securityEvent` → `foundation/observability`. The **CSRF mutation gate** keys on
`Principal.viaCookie` + the custom header: a cookie-authed MUTATION without the header is 403; header/
fallback requests and ALL queries/subscriptions (incl. the SSE stream) are exempt — so the zero-infra
default and the stream are untouched.

**The multi-human surface (unified roster, ledger D16).** Participant-membership authority
(`requireParticipant`/`requireHost`) lands in the DOMAIN verbs (chat's build, `domains/chat.md` Part III
§11) — transport stays a thin gate — BUT the **enforcer's scope reaches into transport**: the membership
chokepoint must cover the **SSE subscribe path** (a kicked member's `chat.streamMessages` stops yielding
within the kick tx — the subscription gate can't be connect-once) **and the cross-domain lineage walkers**.
The **`AUTH_MODE != 'single-user'` capability gate** is a **server-side** guard on every
invite/notifications/join procedure (404 in single-user — never a client hide). The **per-member budget**
rides the existing DB-backed limiter as a turn/request **COUNT** (metering ALL backends — hosted $ AND the
owner's local vLLM/in-process compute, which has no dollar cost but finite hardware), attributed to
**`triggeredBy`** (the caller, captured at trigger time), debited inside the per-chat lock; a member-
triggered `max-pro-sub` turn is refused unless owner consent (D17 — the box is the owner's). The
`adminProcedure` layer-1 / `requireAdmin` layer-2 redundancy + the layer-1 `requireOwner` for box surfaces
stay.

### §7.4 types & schemas — one home, one direction

- Wire schemas DERIVE from the domain/contract tuples — `z.enum(WORKLOAD_STATUSES)`,
  `z.enum(WORKLOAD_KINDS)`, `z.enum(CRED_PROVIDERS)`, `chatApiSchema`/`chatSourceSchema` (from
  `@orb/contracts/connection`), `StartWorkloadInput` (from `domain/workloads`). No router re-spells a
  union inline (the gate is `no-inline-union-redecl`).
- `Context`/`Principal` — the identity shape is `@orb/contracts/identity` (`Principal`); transport's
  `Context` packages it but adds no new exported identity type (the old `AuthContext` is gone).
- `RateLimiter`/`RateLimitConfig`/`RateLimitCause` — transport-internal types in
  `transport/rate-limit.ts` (not contracts — no client consumer).

### §7.5 string-union dispatch discipline

`AI_TURN_PATHS` (`transport/trpc/rate-limit.ts`) is a `ReadonlySet<string>` of `"<router>.<verb>"`
keys — a string-keyed dispatch the router verb names must stay in sync with (e.g. `chat.send`,
`chat.swipe`; `chat.fork` is deliberately EXCLUDED — fork copies canon, no $/GPU at fork time). This
is the one transport-local axis that benefits from the §7.5 treatment: derive it from a typed map of
turn verbs rather than a hand-kept string set, so adding a $-spending verb without adding it to the
bucket is a build error rather than a silent free-turn leak.

### §8.1 coupling / the composition seam

Transport is the proof that the driver tier adds zero coupling: every router is a single front-door
call, the worker enters `workloads` through `index.ts`, and the cross-feature builders that LOOK like
they belong next to the worker (`workloads-env`, `buddy-env`) are correctly hoisted to
`entry/compose/runner-env.ts` (per DECISIONS-LEDGER §7 D4). The one true cross-feature hub TYPE stays
`workloads/contract/runner-env.ts` (a domain contract), and the builder is wired at
`entry/compose/runner-env.ts` — never in transport.

---

## Esoteric / load-bearing (must survive the migration)

1. **The rate-limit injectable `now()` clock seam.** `RateLimitConfig.now` (default `Date.now`) is
   the limiter's ONLY impurity. It exists because of the 2026-06-11 auth-routes flake: N rapid
   attempts that straddle a fixed-window boundary split across two buckets and the N+1th never trips.
   Tests pin time through this seam instead of racing the wall clock. Keep it injectable.

2. **The DB-backed limiter (multi-replica-correct).** `createRateLimiter` replaces the per-process
   `RateLimiterMemory` + the in-proc local-login `Map` — those gave N× the configured cap under N
   replicas. The shared `rate_limit_buckets` table makes the cap real regardless of which replica
   answered. The bucket key is `scope:id:windowStart` (fixed-window, rolls over naturally); the lazy
   sweep is scoped `LIKE 'scope:%'` (a prefix range scan, never a full-table scan) and runs on BOTH
   the allowed and the throttled path. The atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING count`
   avoids a SELECT-then-UPDATE race. This is the reference for "the seam to replace an
   `ASSUMES(single-replica)` in-memory store with a shared one."

3. **The error-mapping discriminators.** `classifyDomainError` walks `.cause` (not a single deref) so
   a tx-wrapper or any re-wrap can't turn a `DomainError` into a 500. Order is load-bearing:
   `DomainNoCredentialError` (→ `PRECONDITION_FAILED`) is checked BEFORE `DomainOperationError`
   (→ `BAD_REQUEST`) so a NoCredential subclass doesn't fall into the generic 400 bucket. The
   **credential 400-not-404** asymmetry is intentional and lives in the DOMAIN: `CredentialsNotFoundError`
   extends `DomainOperationError` (→ 400), NOT `DomainNotFoundError` (→ 404), so not-found and
   not-owned collapse — no existence leak; the discriminator for clients is the `code` field, not the
   HTTP status (credentials.md). `DomainRateLimitError` → `TOO_MANY_REQUESTS` carrying
   `msBeforeNext`/`remainingPoints`, surfaced as `Retry-After` (seconds) + `X-RateLimit-Remaining`
   via the `responseMeta` hook at the entry/app mount.

4. **CSRF / cookie handling at the edge.** The gate keys on `viaCookie` (a cookie request has a
   cross-site surface; a header/fallback request does not) + the presence of the custom CSRF header.
   SameSite=Lax + this header is the whole CSRF story. Applied to mutations only; the `/api/auth/me`
   route additionally re-stamps the session cookie's Max-Age on a throttled server-side expiry slide
   (`onSessionSlide`) — that cookie I/O is route-tier (`entry/http`), not transport.

5. **The SSE / streaming response shape.** `chat.streamMessages` is the load-bearing pattern: attach
   the live listener FIRST, then replay (durable log on reconnect via `lastEventId`, or the in-memory
   ramp-up buffer on first subscribe), then drain live; EVERY yield is `tracked()` for a uniform
   `{id,data}` envelope (a mix of tracked + plain breaks client discriminant narrowing); `resumeId`
   ADVANCES only on durable (cursor-carrying) events so a reconnect never replays tokens; a cursor
   predating the retained window synthesizes a `historyTruncated` → client refetch. The
   **draft-tolerant ownership gate** withholds-not-throws (a client may subscribe to a client-minted
   `chatId` before `chat.start` commits) — and CRITICALLY, **a subscription generator BYPASSES the
   `domainErrorMiddleware`**, so a thrown `NOT_FOUND` surfaces as a spurious 500; gate every yield and
   only let a non-NotFound error propagate. `workloads.subscribe` mirrors the replay-then-live shape
   (overlap is idempotent on the client).

6. **healthz semantics.** `/api/healthz` returns 503 the moment `isShuttingDown()` flips (so caddy/k8s
   pull traffic BEFORE the listener closes), 200 otherwise. `vllmEngines` (engine statuses) ride
   along but are **informational only** — warming/down engines do NOT flip readiness (the server
   serves everything else; the vLLM runners fail typed until `/health` answers). `runnerOverride`
   exposes the scripted-runner test seam so an e2e can skip the model-burning send.

7. **The two-bucket public rate split.** `publicProcedure` splits by identity: an AUTHENTICATED caller
   hits the generous per-user `authed` bucket (queries + mutations), an ANONYMOUS caller the tight
   per-IP `publicIp` bucket — so a real session is never throttled on the anonymous IP cap (the bench
   tripped 60/min on every query before this). Mutations ADDITIONALLY hit the per-user `general`
   backstop + the stricter `aiTurn` bucket for $/GPU verbs. `orCredits`/`orActivity` deliberately skip
   `aiTurn` (abuse spends the user's OpenRouter quota, not ours).

8. **The per-procedure tracing span (the trace root).** `tracingMiddleware` is FIRST in the
   `publicProcedure` stack so a 401/429 from a gate below still shows the procedure name + the gate
   outcome. A typed domain error resolves the span status to OK (the procedure ran; the error is data,
   badged as an attribute); only an uncaught mid-handler throw marks the span error. Every downstream
   db/provider span nests into `trpc.<router>.<proc>`.

9. **`fetchModels`/`inspectEndpoint` are `.mutation()` despite being reads.** They make an outbound
   call to a user-supplied `baseUrl` (an SSRF surface), so they keep the CSRF gate tRPC applies to
   mutations. Do NOT demote to `.query()` for the lack of local state change.

10. **`corpus.embed` is `adminProcedure`, not `authed`.** It is the only write proc that drives local
    GPU embedding inline (the bulk path is the admin-only `embed-corpus` workload); gating the inline
    embed the same way keeps "who can drive the embed engine" consistent. The producer FK (e.g.
    `characterId`) is validated against `Principal.userId` (the caller must own the producer); the
    vector row carries NO `ownerId` to derive or spoof (D20 — `embeddings.store` takes producer FK refs,
    not an owner), so the caller-supplied-owner bug (audit #1: a user wrote a vector row attributed to
    anyone) is structurally impossible.

---

## Invariants (gate candidates)

1. **Transport calls DOWN into domain front doors only.** A router imports `#server/domain/<feature>`
   (index), never a `verbs/`/`persistence/`/`engine/`/`runners/` deep path, and never `infra/`
   directly.
   *Enforcement: resolve-time (tier order — `transport` is above `domain`, `infra` is below it and
   not in transport's consuming direction) + dep-cruiser `drivers-through-domain` / `no-cross-driver`.*

2. **The job drivers enter `workloads` through `index.ts`.** The engine entry points
   (`runWorkload`/`reapOrphanedWorkloads`/`nextRunnableWorkload`/the bus trio) are deliberately on the
   front door so the worker enters legally; it never reaches `engine/`/`runners/` directly.
   *Enforcement: resolve-time (front-door rule) + dep-cruiser backstop.*

3. **Composition lives at `entry/`, never `transport/`.** A transport file that imports two domain
   front doors, or a domain + the auth seam, or builds the `WorkloadRunnerEnv`, is wrong.
   *Enforcement: NOT a single dep-cruiser rule — it can't count front-door imports per file. Caught by
   the front-door + no-cross-driver rules + review; a ts-morph "≤1 domain front door per transport file"
   gate is the backlog candidate if it ever slips. (The cross-feature builders are already hoisted to
   `entry/compose` per D4, so there's no live offender.)*

4. **Wire schemas derive from the domain tuples; no inline union re-spelling.** `z.enum(WORKLOAD_STATUSES)`,
   `z.enum(CRED_PROVIDERS)`, `chatApiSchema`, etc. are imported, not re-typed.
   *Enforcement: compile-time (the tuple is the source) + lint `no-inline-union-redecl`.*

5. **`classifyDomainError` is total + correctly ordered.** Every `DomainError` subclass maps to a
   code; `DomainNoCredentialError` precedes `DomainOperationError`. A new subclass = one branch + one
   test.
   *Enforcement: test-time (one case per subclass; the classifier is pure, tested without the ladder).*

6. **`adminProcedure` (layer-1) is paired with `requireAdmin` (layer-2) in the domain.** A driver gate
   is not the only check on an admin surface.
   *Enforcement: compile/test-time (the admin verbs call `requireAdmin`); the procedure tier is the
   transport half.*

7. **The rate-limiter's only impurity is the injectable `now()`.** No `Date.now()` inline in the
   consume path.
   *Enforcement: compile-time (the `now` seam) + test-time (window-boundary tests pin it).*

8. **The CSRF gate fires on cookie-authed mutations only.** Queries/subscriptions (incl. SSE) are
   exempt; header/fallback requests are exempt.
   *Enforcement: test-time (a cookie mutation without the header is 403; a query is not).*

9. **Routers are thin: validate → `ctx.services.X` → map errors.** No business logic, no db/provider/
   infra import, no inline domain types.
   *Enforcement: lint-time (dep-cruiser: no `@orb/db`/`infra/*` import in `transport/trpc/routers/`) +
   §7.4 `no-inline-types`.*

---

## Resolved decisions (was: open)

- **`http/` tier home — RESOLVED: `entry/http/`.** The non-tRPC registrars
  (`assets`/`import`/`export`/`health`/`auth-meta`) wire domain+infra+the auth seam (composition), which
  is above `domain-no-cross-feature` and so cannot be a thin driver. Even the genuinely-thin ones
  (`health`, `export`, blob-serve) live at the route tier (entry) so the `register<X>Routes` discipline +
  the shared auth-seam wiring follow one consistent rule. Consistent with `structure.md` §3 and every
  domain doc (`assets.md`/`sessions.md`/`import.md`/`export.md`); no conflict remains.

- **The rate-limit primitive's tier — RESOLVED: keep the primitive in `transport/rate-limit`,
  constructed at `entry/`.** The DB-backed `createRateLimiter`/`RateLimiter`/`RateLimitConfig` IS the
  transport gate's mechanism (dissolution §6 LOCKED). The primitive file MAY import the `@orb/db` PACKAGE
  (a package-cake dep below `server` — not a server-internal tier violation); the INSTANCES are
  constructed at the `entry/` composition root (db is required at construction) and threaded onto
  `ctx.rateLimit`. The factory is NOT moved to entry/infra (that would split the gate's mechanism from
  its tier).

- **The corpus→discovery/search/embeddings router rewire — RESOLVED.** `search.fields`/`search.suggest`
  → the `search` domain (`corpus.fieldSearch`/`fieldSuggest` deleted); the `corpus` read procs →
  `discovery`; `corpus.embed` → `embeddings`. The read router is **renamed `routers/discovery.ts`**
  (matching the domain) — there are no client callers of the old `corpus.*` namespace, so the rename is
  free (the analytics→corpus rename precedent). All stay thin front-door delegations.

- **`AI_TURN_PATHS` typing — RESOLVED: promote to a typed map keyed off the chat router's turn verbs.**
  Derive the set from a typed map of turn verbs (not a hand-kept string `Set`) so a new $-spending verb
  that misses the strict `aiTurn` bucket is a build error, not a silent free-turn leak (§7.5
  `exhaustive-dispatch`). `chat.fork` stays deliberately EXCLUDED (copies canon, no $/GPU at fork time).

- **Blob-serve transform orchestration — RESOLVED: extract** the `?w=&f=webp` snap+cache+`sharp` block
  into `domain/assets/verbs/resolve-variant.ts` (injecting a `sharp` infra adapter), keeping `entry/http`
  thin and `sharp` out of `entry/`. (Aligned with `assets.md`.)

### Still open (deferred, with criterion)

- **The Retry-After / `responseMeta` mapping home — DEFERRED: stays inline at the `entry/app.ts` tRPC
  mount.** It reads `DomainRateLimitError` fields (a transport/kit error). *Criterion to extract:* iff a
  second mount/consumer needs the mapping — then lift to a small `transport/trpc/response-meta.ts` helper
  the mount calls. Until then, inline at the mount.
