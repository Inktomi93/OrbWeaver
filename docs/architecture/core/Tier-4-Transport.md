---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — `transport` (trpc · jobs): the thin drivers at the request edge

`transport` is the DRIVER tier — validates/sequences a request and delegates DOWN into domain front doors. A router is "validate input → call `ctx.services.<feature>.<verb>` → map the typed domain error to a wire code"; a job driver is "decide which row / when → call the workloads front door." Two drivers: **trpc** and **jobs**. The non-tRPC HTTP registrars are NOT transport — they tier under `entry/http/` (composition across domain+infra+the auth seam; only `entry/` may cross feature front doors).

## What this tier owns

- **The tRPC router tree** — `appRouter` (`router.ts`) mounting one thin router per domain (`routers/<feature>.ts`: admin · assets · buddy · character · chat · connection · credentials · discovery · hub · invites · notifications · persona · preset · search · sessions · settings · stats · tag · workloads · world-info — 20 domain routers) plus the loose public procs (`health`/`echo`/`clientError` — the last is the client error-boundary's fire-and-forget report). Every domain procedure: validate (zod) → `ctx.services.<feature>.<verb>` → typed-error map. **Zero business logic, zero db/provider/infra access.**
- **The procedure ladder + middleware** (`trpc.ts`) — the single `initTRPC` init; `publicProcedure → authedProcedure → adminProcedure`, built ONCE. Stack order: tracing span → domain-error map → rate-limit gate → auth+CSRF gate → admin gate. `adminMiddleware` is transport's **layer-1** authority gate (the domain verb's `requireAdmin` is layer-2); both route through the one `can()` seam (`#domain/admin`).
- **The tRPC context** (`context.ts`) — packages the entry-built `Principal`, the `Services` bundle, the `RateLimitGate`, and `clientIp` into the per-request `Context`. Pure packaging: no db, no header parsing, no identity resolution (that is the entry seam).
- **The error-mapping classifier** (`error-mapping.ts`) — `classifyDomainError`: pure `@orb/kit/errors` `DomainError` subclass → tRPC code via a `.cause` walk; tested without the ladder.
- **The rate-limit primitive + the gate PORT** — `transport/rate-limit.ts` (`createRateLimiter`: the DB-backed multi-replica limiter) and the `RateLimitGate` interface (`context.ts`). The limiter INSTANCES + the bucket POLICY are built at `entry/rate-limit-gate.ts` (db at construction) and threaded onto `ctx.rateLimit`; transport declares the port and calls `enforce`. Wired buckets today: anonymous per-IP (`publicIp`) + authed per-user (`general`). The per-member COUNT budget is WIRED — `createMemberBudget` (`transport/rate-limit.ts`), minted at `entry/compose/chat.ts` and threaded to chat as `debitBudget`. The $/GPU `aiTurn` bucket remains declared-not-wired (the `rateLimits.aiTurn` settings knob + `RATE_LIMIT_AI_TURN` env exist; no limiter consumes them). Second policy site: `entry/http/auth-routes.ts` owns its own `login-ip` throttle (10/min) for the auth-mint route, adjacent to the route it guards — not a tier violation (both entry/), but not this one home.
- **The SSE machinery** — `subscriptions.ts` (`withSubscriptionErrors` — the typed-error wrapper, see Esoteric #5), `chat-events-bus.ts` (the per-chat live bus behind `chat.streamMessages`), `buddy-bus.ts` + `user-events-bus.ts` (the buddy/user-scoped live buses), and the **per-user notifications subscription** (`notifications-bus.ts` + `routers/notifications.ts`): the durable inbox is the `notifications` DOMAIN; transport owns the resumable subscription (every yield `tracked()`, `lastEventId` replay, durable-first/fan-out-second — the `chat.streamMessages` resume shape, NOT an in-memory-only ring).
- **Presence** (`presence-registry.ts`) — a server-observed SSE-connection ref-count per `userId` (debounced grace window, injected clock), the ONLY liveness source (a client-asserted heartbeat is spoofable presence = a prompt-composition attack). Exposed DOWN to chat as an injected `presence.read` op for cast-gating.
- **The in-server job drivers** (`jobs/`) — the **workloads worker** (poll/claim/wake-on-emit/reap-tick/graceful-abort), the **catalog-refresh scheduler**, the **oidc-gc-scheduler**, and the **workload-schedule-scheduler**. All are pure drivers: the engine ops (`nextRunnable`/`run`/`reap`/`load`) and the wake source are INJECTED at the composition root — the driver files import only types from the workloads front door; zero feature boundaries crossed.

Inventory lists are illustrative — `transport/trpc/routers/` + `transport/jobs/` on disk are the truth.

NOT owned: the `Principal` construction (→ `entry/auth/seam.ts`; transport CARRIES it on `ctx`); the non-tRPC registrars (→ `entry/http/`); the cross-feature env builders (→ `entry/compose/runner-env.ts`, D4); the bulk-import driver (→ `entry/import/`); business logic of any kind; the rate-limiter instances + bucket policy (→ `entry/rate-limit-gate.ts`).

## The driver-vs-composition line

| If a unit… | …it is | …and lives in |
| - | - | - |
| validates+sequences and calls DOWN into ONE domain front door | a **thin driver** | `transport/` |
| wires TWO+ domain front doors, or a domain + infra + the auth seam | **composition** | `entry/` |

## Cross-tier composition (the front-door rule)

Transport imports a domain's `index.ts` only — never `verbs/`/`persistence/`/`engine/` deep paths, and never `infra/` directly (route through a domain, or the unit belongs in `entry/`). RED: a deep import; a transport file importing two domain front doors; the `Principal` resolved in transport. The engine entry points are deliberately ON the workloads front door so the worker enters legally. *Enforcement: dep-cruiser `drivers-through-domain` + `no-cross-driver` + `domain-below-drivers`.*

## Spine intersections

### §7.1 identity / auth / permission

The `Principal` is resolved ONCE at `entry/auth/seam.ts` and flows down immutable on `ctx.auth`; transport gates on plain fields — `authMiddleware` checks `ctx.auth !== null` (the resolved Principal; `null` = anonymous → 401), `adminMiddleware` checks `can(p,'admin',global)` (= owner ∪ admin, D17; via `requireAdmin`; 403). No db round-trip in the gates. Every denial (`auth_required`, `csrf_rejected`, `rate_limit`, `admin_required`) emits a `securityEvent`. The **CSRF mutation gate** keys on `Principal.via === "cookie"` + the custom header; queries/subscriptions (incl. SSE) and `header`/`fallback` requests are exempt.

**The multi-human surface (D16).** Membership authority (`requireParticipant`/`requireHost`) lives in the DOMAIN verbs, but the enforcer's scope reaches into transport: the **membership chokepoint covers the SSE subscribe path** (a kicked member's `chat.streamMessages` stops yielding within the kick tx — the gate can't be connect-once). The **multi-human capability gate (B4 — spec'd in FINAL-Auth-Modes §9, retired; this paragraph is the surviving statement)** is **ENFORCED at the ladder**: `multiHumanProcedure` (`trpc.ts`) refuses its surfaces with a uniform NOT\_FOUND while `ctx.multiHumanCapable` is FALSE (single-user → never capable; local → the runtime `LOCAL_MULTI_USER` AppSettings toggle, default OFF; forward-header/oidc → capable; derived PER REQUEST at the entry mount — transport reads no env/settings), firing BEFORE the auth gate so even an anonymous probe sees the unmounted-procedure shape. Every multi-human router rides that rung — `routers/notifications.ts` (CRUD + the subscription) and `routers/invites.ts` (the invite lifecycle: create/preview/redeem/accept/decline/revoke/`listInvites` + kick/selfLeave/host-handoff; `/join/:token` at `entry/http/join.ts` shares the same per-request derivation). Multi-CHARACTER rooms are NEVER gated here — `chat.startChat`/`addCharacterToChat` ride `authedProcedure` (the retired FINAL-Auth-Modes §9 ruling 3). The chat `single_user_mode` op-code stays the DOMAIN-side discriminator for verb-level refusals; the transport shape is deliberately the leak-free 404. The **per-member turn/request COUNT budget** (metering hosted $ AND local compute, attributed to `triggeredBy`, debited inside the per-chat lock; member-triggered `max-pro-sub` refused without owner consent, D17) is WIRED — `createMemberBudget` (`transport/rate-limit.ts`), threaded as `debitBudget` from `entry/compose/chat.ts` (its own transport primitive beside `RateLimitGate`, not a bucket on it).

### §7.4 / §7.5 types & unions

Wire schemas DERIVE from contract tuples (`z.enum(WORKLOAD_STATUSES)`, `chatApiSchema`, …) — no router re-spells a union inline (`no-inline-union-redecl`). The identity shape is `@orb/contracts/identity` `Principal`; transport adds no exported identity type. When the `aiTurn` bucket lands, its turn-verb set derives from a typed map of the chat router's $-spending verbs (a missed verb = build error, not a silent free-turn leak); `chat.fork` stays deliberately excluded (copies canon, no $/GPU at fork time).

## Esoteric / load-bearing

1. **The rate-limit injectable `now()` clock seam.** The limiter's ONLY impurity: without it, rapid attempts straddling a fixed-window boundary split across two buckets and the N+1th never trips. Tests pin time through the seam. *(origin incident: `history/tier-4-5-archaeology-record.md`.)*

2. **The DB-backed limiter (multi-replica-correct).** Replaces per-process memory limiters (N× the cap under N replicas). Bucket key `scope:id:windowStart` (fixed window); the lazy sweep is a `LIKE 'scope:%'` prefix range scan on the PK, run best-effort on both outcomes; the atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING count` avoids the SELECT-then-UPDATE race. The reference pattern for replacing an `ASSUMES(single-replica)` store with a shared one.

3. **The error-mapping discriminators.** `classifyDomainError` walks `.cause` so a re-wrap can't turn a `DomainError` into a 500. Order is load-bearing: `DomainNoCredentialError` (→ PRECONDITION\_FAILED) precedes `DomainOperationError` (→ BAD\_REQUEST). The credential 400-not-404 asymmetry lives in the DOMAIN (`CredentialsNotFoundError extends DomainOperationError` — not-found and not-owned collapse; no existence leak; clients discriminate on the `code` field). `DomainRateLimitError` → TOO\_MANY\_REQUESTS carrying `msBeforeNext`/`remainingPoints`, surfaced as `Retry-After` (seconds, ceil of `msBeforeNext`) + `X-RateLimit-Remaining` via the `responseMeta` hook at the entry/app mount (`rateLimitResponseMeta`; reads the classifier-preserved `DomainRateLimitError` off the mapped `TRPCError.cause`).

4. **CSRF at the edge.** The gate keys on `via === "cookie"` + the custom header, mutations only. SameSite=Lax + the header is the whole story; cookie WRITE I/O is route-tier (`entry/http/auth-routes.ts`), never transport.

5. **The SSE / streaming response shape.** `chat.streamMessages` is the load-bearing pattern: attach the live listener FIRST, then replay the durable log (`lastEventId` → the member-gated replay), then drain live; EVERY yield is `tracked()` (a mix of tracked + plain breaks client discriminant narrowing); `resumeId` advances only on durable cursor-carrying events. (COMMITTED, not yet built: a cursor predating the retained window is meant to synthesize `historyTruncated` → client refetch — the event type is in the `ChatBusEvent` union but the synthesis is unwired; `bus-coverage` gate DEFERRED entry.) A subscription generator BYPASSES `domainErrorMiddleware` (the middleware returned long before the generator throws), so a typed `DomainError` would surface as a spurious 500 — `withSubscriptionErrors` (`subscriptions.ts`) converts it into a typed terminal frame instead; a genuine non-domain throw still propagates. The draft-tolerant ownership gate withholds-not-throws (a client may subscribe to a client-minted `chatId` before `chat.start` commits).

6. **healthz semantics.** `/healthz` (entry) returns 503 the moment shutdown drain begins (LB pulls traffic BEFORE the listener closes) and 503 on the boot decrypt-probe failure (`credentials_key_mismatch`); 200 otherwise. Warming/down vLLM engines never flip readiness — the server serves everything else; the vLLM runners fail typed until `/health` answers.

7. **The two-bucket public rate split.** An AUTHENTICATED caller hits the generous per-user bucket; an ANONYMOUS caller the tight per-IP bucket — a real session is never throttled on the anonymous IP cap. An unresolvable peer address keys a shared sentinel bucket (better one shared throttle than an un-throttled hole). The stricter `aiTurn` bucket for $/GPU verbs is the P5 addition (not yet wired).

8. **The per-procedure tracing span (the trace root).** `tracingMiddleware` is FIRST so a 401/429 from a lower gate still shows the procedure name + outcome. A typed domain error resolves the span OK (the error is data, badged as an attribute); only an uncaught mid-handler throw marks it error. Every downstream db/provider span nests into `trpc.<path>`.

9. **`fetchModels`/`inspectEndpoint` are `.mutation()` despite being reads.** They call a user-supplied `baseUrl` (SSRF surface), so they keep the CSRF gate tRPC applies to mutations. Do NOT demote to `.query()`.

10. **Vector-write authority.** Embedding runs via the `embed-corpus`/`embed-assets` workload — per-user `singular` (a user re-embeds their OWN producers; the enumeration is owner-scoped) or box-owner `bulk` (all owners). Producer FKs are validated against the resolved owner, and the vector row carries NO `ownerId` to derive or spoof (D20 — `embeddings.store` takes producer FK refs, not an owner), so a caller-supplied-owner write is structurally impossible; owner-scope on READ derives via the producer FK (D20/D23).

## Invariants

1. **Transport calls DOWN into domain front doors only** — no deep paths, no `infra/`. *(dep-cruiser `drivers-through-domain` / `no-cross-driver`.)*
2. **The job drivers construct nothing** — engine ops + wake source injected at the root; type-only front-door imports. *(dep-cruiser + review.)*
3. **Composition lives at `entry/`, never `transport/`** — no transport file imports two domain front doors or builds a runner env. *(front-door rules + review.)*
4. **Wire schemas derive from contract tuples.** *(`no-inline-union-redecl`.)*
5. **`classifyDomainError` is total + correctly ordered** — a new subclass = one branch + one test. *(test-time.)*
6. **`adminProcedure` (layer-1) is paired with the domain's `requireAdmin` (layer-2).** *(compile/test-time.)*
7. **The limiter's only impurity is the injectable `now()`.** *(compile + test-time.)*
8. **The CSRF gate fires on cookie-authed mutations only.** *(test-time.)*
