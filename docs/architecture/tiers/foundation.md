# Orbweaver — `foundation`: the base tier (env-read · observability · residual config)

> **Status: planning (authoritative detail).** `foundation` is the floor of the server cake — **read
> DOWN-into by every tier, reaches UP to none.** It owns exactly three concerns: **env** (the single
> `process.env` reader, the raw boundary), **observability** (logger, tracing/spans, the request/log/trace
> rings, the `audit` log, AND the `/api/_debug` surface — `debug` is observability, not a domain), and a
> nearly-empty **config** (constants — `version`; the floor-merge does NOT live here). The defining
> change from neo-tavern: the `config` tier almost vanishes — the AppSettings **floor-merge**
> (`app-config.ts`) **folds into the settings DOMAIN** (`settings.md`), the `debug` domain **folds into
> observability**, `_shared/audit.ts` **moves here**, and the lone `foundation→infra`
> `DEFAULT_*_MODEL_ID` edge is **killed**. Authoritative upstream: `structure.md` §3 (foundation =
> env·config·observability, read-down-by-all, never reaches up) + §7 (gates); `_FANOUT-BRIEF.md` §2
> (the hard one-directional rule), §3 (`→ foundation` taxonomy), §7.2 (the FOUR natures of config — the
> spine), §4 (`debug` → observability), §8.1 (the `DEFAULT_*_MODEL_ID` edge kill); `reports/
> shared-dissolution.md` §6 (`audit.ts` → `foundation/observability`) + §1 (`errorMessage` is **kit**,
> not foundation). **Reconcile, do not double-claim:** `domains/settings.md` (the floor-merge is the
> settings domain's `effective-config/` subsystem — foundation owns env READING only) and
> `domains/credentials.md` (the `CREDENTIALS_KEY_AUTO` auto-key boot path is `infra/crypto`'s; env only
> supplies `CREDENTIALS_KEY`). Read those first.

---

## What this tier owns

- **`env` — the ONE `process.env` reader (nature (a): boot / secret / identity).** The whole of
  neo-tavern's `server/env.ts`: the `dotenv.config()` load, the `envSchema` Zod parse, the
  `superRefine` **boot-fatality** per `AUTH_MODE`, and the exported frozen `env` object. Every other
  tier imports `env` and dot-accesses typed keys (`env.PORT`); nothing else touches `process.env`. The
  raw `process.env` snapshot producer `hostEnvForClaudeChild()` (the baseline both Claude-SDK child env
  builders spread) lives here too — it is a `process.env` reader, so it stays under the single-reader
  roof (the firewall *policy* it serves does not — see "does NOT own").
- **`observability/logger` — pino + the in-process rings + request scope.** The structured pino logger
  (fan-in ~94), the `LineRing`/`RequestRing` bounded ring buffers that back `/api/_debug` (logs are
  METADATA — RP content lives in the DB), the `AsyncLocalStorage` request scope (`runInRequest` /
  `getLog` / `bindRequestUser` / `getRequestUserId`), and `securityEvent` (the one greppable
  `security:true` audit-trail line, consumed across auth / network / transport).
- **`observability/tracing` — OTel spans + the trace ring + the DB driver wrap.** `initTracing`,
  `span` / `withRequestSpan` / `addSpanEvent` / `setSpanAttrs`, the per-`requestId` `TraceRing` with its
  orphan-bucket eviction, the read APIs (`recentTraces` / `getTraceByRequestId`), and
  `wrapLibSqlClient` (the libSQL Proxy that turns every query into a `db.<method>` span). This IS the
  "metrics" surface — there is no separate metrics module; metrics are the per-trace **totals**
  (`spanCount` / `dbDurationMs` / `providerDurationMs`) computed at seal-time plus the request-ring
  timing.
- **`observability/middleware` — the per-request Hono middleware.** Assigns/echoes `X-Request-Id`
  (charset-guarded), opens the request-root span, binds the request-scoped logger, and logs one
  structured `request` line + records the request ring. Skips `/api/_debug/*` (so introspection traffic
  doesn't evict real traces).
- **`observability/audit` — the best-effort audit log (MOVED here from `_shared`).** `logAudit`
  (fan-in 60/61) + `getAuditFailureSnapshot` / the sticky failure window. Writes the `audit_logs` row;
  **never breaks the primary channel** (suppress → count → drop) and trips a sustained-failure warn
  every 25th drop. Co-located with the surface that reports it (debug `stats`).
- **`observability/debug` — the `/api/_debug` surface (the `debug` DOMAIN folds in here).** The
  curl-instead-of-tail introspection API: the two-tier auth gate (admin-cookie short-circuit →
  `DEBUG_TOKEN` fallback), the route registrar, and the read-only **DB probes** (`tableCounts` /
  `integrityProbe` / `inspectChatState`) that today live in `domain/debug`. `debug` was never a
  business domain — it is observability's read side.
- **`config` — what genuinely remains: constants.** `version` (`APP_VERSION`, read down by `tracing`
  and `debug/info`). That is essentially all — the floor-merge tier is gone (see "does NOT own").

This tier does **not** own:

- **The AppSettings floor-merge** (`envDefaults()` / `layer()` / the resolved-config cache / the
  `EffectiveAppConfig` resolver). Per `settings.md` this folds into the **settings domain** as its
  `effective-config/` subsystem; `EffectiveAppConfig` (the TYPE) → `@orb/contracts/settings`. Foundation
  owns env READING (the floor's *source*); the **toggle RESOLUTION** (env-floor ⊕ DB-override, nature
  (b)) is settings'. `foundation/config` therefore contains **no `app-config.ts`**.
- **The agent-sdk runtime config (nature (c) — the homeless one).** ~13 isolation pins + the
  11-key reserved-denylist + the 3-mode credential firewall. It is a backend-internal config of the
  claude-sdk strategy → `infra/providers/backends/agent-sdk`. It is called "env" only because it *emits* env
  vars. Explicitly excluded. (The `HOST_SECRET_ENV_KEYS` *denylist policy* belongs with that firewall;
  only the `process.env`-reading `hostEnvForClaudeChild` baseline producer stays in `env` — see Open
  decisions.)
- **`errorMessage` and the other `_kit` primitives.** `tracing.ts` imports `errorMessage` from
  `#shared/_kit/error-message`; per `shared-dissolution.md` §1 that is **`@orb/kit`**, not foundation.
  `stats-tally` (turn economics) splits to `kit` + `contracts/stats`; neither is foundation observability.
- **The `CREDENTIALS_KEY_AUTO` auto-key boot path.** That is `infra/crypto`'s one-shot `SecretBox`
  initialization (`credentials.md` §7.2). `env` only supplies the raw `CREDENTIALS_KEY` string (and
  validates length in `infra/crypto`, NOT at boot — a missing/short key must DEGRADE, never crash).
- **The boot/shutdown protocol (`lifecycle.ts`).** DECIDED `entry/lifecycle.ts` (the composition
  root), per DECISIONS-LEDGER §7 D5: it is invoked once with injected deps (`httpServer` / `db` /
  `intervals` / `onShutdown`), is read by entry only, and reaches down only to `logger` — it is NOT
  "read down by all," so it fails the foundation test. The `foundation/lifecycle.ts` alternative is
  closed. (See the movement table.)
- **The admin gate / auth resolution / asset CAS.** The debug surface needs an `isAdmin` check and an
  asset `fsck`; both would be UPWARD imports (auth/entry, `domain/assets`). Foundation declares them as
  **structural-injection ports** and entry supplies the impls — inversion of control, no upward import.

---

## The defining invariant — foundation reaches UP to NOTHING

> Every other tier imports foundation; foundation imports only `@orb/kit`, `@orb/contracts`, `@orb/db`
> (all lower packages) and within-tier siblings. A `foundation → domain` or `foundation → infra` source
> import is RED.

There is **one** such edge in neo-tavern today and the remake kills it: `observability/debug.ts`
imports `DEFAULT_CHAT_MODEL_ID` / `DEFAULT_OR_CHAT_MODEL_ID` from `#server/providers` (infra) to report
them on `/api/_debug/info`. `_FANOUT-BRIEF.md §8.1` moves those two constants off `providers/index.ts`;
in orbweaver they land in `@orb/contracts/connection` (default-model-id is connection vocabulary, a
cross-boundary shape), and `foundation/observability/debug` reads them **down** from contracts. That is
the single change that makes the whole tier strictly downward.

The other two foundation↑ pressures are resolved by **inversion of control**, not imports:

- `AssetInspector.fsck()` (CAS health) — `domain/assets` is UP. Foundation declares the structural port;
  `entry/` wires `assetsService.fsck`.
- `AdminAuthChecker.isAdmin()` (debug cookie gate) — the auth resolver is up-stack. Foundation declares
  the port; `entry/` adapts the auth resolver into it. (`isAdmin` is contracted to **never throw** — a
  misbehaving auth seam degrades to "deny via this path," never opens the gate.)

The third — the DB probes — needs no port at all in orbweaver: `@orb/db` is a **lower package**, so
`foundation/observability/debug` may import the schema + client directly. The neo-tavern `DbInspector`
structural port existed only because observability couldn't reach `domain/debug/persistence` upward;
folding the probes into foundation and reading `@orb/db` down **drops that port** (see Open decisions).

---

## Internal layout

```
foundation/
├── env/
│   └── index.ts            THE one process.env reader — dotenv.config(override) + envSchema (Zod)
│                           + superRefine boot-fatality (AUTH_MODE=oidc|local) + the frozen `env`
│                           + hostEnvForClaudeChild() (raw process.env snapshot producer)
├── observability/
│   ├── logger.ts           pino (multistream: stdout + ringStream) + redact paths + LineRing/RequestRing
│   │                       + AsyncLocalStorage request scope (runInRequest/getLog/bindRequestUser) + securityEvent
│   ├── tracing.ts          OTel BasicTracerProvider + RingExporter + TraceRing (orphan-bucket eviction)
│   │                       + span/withRequestSpan/addSpanEvent/setSpanAttrs + wrapLibSqlClient (the DB-driver Proxy)
│   │                       + recentTraces/getTraceByRequestId  (SerializedSpan/RequestTrace shapes)
│   ├── middleware.ts       the per-request Hono middleware (X-Request-Id + root span + request line + request ring)
│   ├── audit.ts            logAudit (best-effort, suppress→count→drop) + getAuditFailureSnapshot   ← from _shared
│   └── debug/              the /api/_debug surface  ← the `debug` DOMAIN folds in here
│       ├── routes.ts       registerDebugRoutes + createDebugAuthMiddleware (admin-cookie → DEBUG_TOKEN)
│       │                   + the structural ports: AssetInspector, AdminAuthChecker (entry supplies impls)
│       └── inspect/        the read-only DB probes (import @orb/db DOWN — no DbInspector port)
│           ├── stats.ts        tableCounts + auditFailures snapshot
│           ├── integrity.ts    PRAGMA foreign_key_check + integrity_check
│           └── inspect-chat.ts inspectChatState (row + the flat card row + messages+variants + events)
└── config/
    └── version.ts          APP_VERSION (read package.json once)   ← the floor-merge does NOT live here

  (lifecycle.ts → entry/  ·  the floor-merge → domain/settings/effective-config/  ·  nature (c) → infra/providers/backends/agent-sdk)
```

**`debug` folds in (not a domain):** its `service.ts` / `context.ts` / `contract/` / `verbs/` /
`persistence/` collapse into `observability/debug/`. The verbs are thin wrappers over the persistence
probes (`stats` adds `getAuditFailureSnapshot()` — now an intra-tier read, both in foundation). The
8-slot domain template does NOT apply: this is a foundation read-surface, not a feature.

**`config` shrinks to nothing-but-constants:** the only resident is `version`. The big `config/`
occupant in neo-tavern — `app-config.ts` — is gone (→ settings). If `version` were the lone file, it
could even sit loose; kept under `config/` for the named-tier legibility `structure.md §3` wants.

---

## Runtime dependencies (join the catalog at Phase 4a — `BUILD-PLAN §4a`)

The observability tier is the only foundation code with third-party runtime deps. They are added to
the pnpm catalog when 4a is built (not at Phase 0 — the catalog grows per-tier); versions are
2026-stable, confirm-latest at build.

| Package | Version | Module | Note |
|---|---|---|---|
| `pino` | `^10.3.1` | `observability/logger.ts` | the structured logger; `pino.multistream([stdout, ringStream])` |
| `pino-pretty` | `^13.1.3` | **dev-only** | NOT a prod transport — piped by the dev script (`dev:server: tsx watch entry/index.ts \| pino-pretty`). Prod emits raw JSON to stdout; the `ringStream` Writable captures the already-serialized line on the main thread, so a worker-thread pino *transport* would double-serialize and starve the ring. `pino-pretty` is a pipe, never a configured transport. |
| `@opentelemetry/api` | `^1.9.1` | `observability/tracing.ts` | span API |
| `@opentelemetry/sdk-trace-base` | `^2.8.0` | `observability/tracing.ts` | `BasicTracerProvider` + the `RingExporter` (a `SpanProcessor` → the `TraceRing`, the OTLP-replaceable seam) |
| `@opentelemetry/context-async-hooks` | `^2.7.1` | `observability/tracing.ts` | ALS context manager — ties spans to the same request scope the logger uses |
| `@opentelemetry/resources` · `@opentelemetry/semantic-conventions` | `^2.7.1` · `^1.41.1` | `observability/tracing.ts` | `service.name`/`service.version` resource attrs (version ← `config/version`) |

No env (LOG_LEVEL) runtime dep — that is `@orb/contracts/settings` (the `LOG_LEVELS` tuple, a lower
package, imported DOWN).

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `server/env.ts` (whole) | stays a tier, un-moved | `foundation/env/index.ts` | The ONE `process.env` reader; keep the `superRefine` boot-fatality, the `dotenv override` discipline + its two escape hatches, the frozen `env`. Imports `LOG_LEVELS` from `@orb/contracts/settings` (DOWN). | resolve-time: foundation tier; **lint-time** — a gate asserts no `process.env` access outside `foundation/env` (the sole-reader rule) |
| `env.ts` — `hostEnvForClaudeChild()` + `HOST_SECRET_ENV_KEYS` | reader stays; policy splits | reader → `foundation/env`; the denylist **policy** → `infra/providers/backends/agent-sdk` (nature (c) firewall) | `hostEnvForClaudeChild` reads `process.env` wholesale, so the read stays under the single-reader roof; *which* keys the Claude child may not see is the credential-firewall's concern, not env's. | lint-time (sole-reader covers the read); **Open decision** on the denylist split |
| `env.ts` — `IMPORT_DEFAULT_SOURCE`, `RATE_LIMIT_*`, `VLLM_*_CONCURRENCY` | candidate promotion (b) | `@orb/contracts/settings` AppSettings fields (env floor preserved) | Stranded runtime toggles — nature (b) by behavior, with no DB override. The env READER stays here; the *toggle* becomes an AppSettings field (env floor ⊕ admin override). **Not a foregone move** — defer to `settings.md` Open decisions (rate-limit budgets may stay boot-env). **`IMPORT_DEFAULT_SOURCE` is not yet an env reader (D40):** it is DEFERRED to the import slice — a `z.enum(CRED_SOURCES)` floor with a NODE_ENV-conditional default needing a post-parse transform, so it lands in `foundation/env` (co-located with its `domain/import` consumer) at build, NOT silently dropped; `foundation/env` carries a spec'd placeholder comment at the import-toggles block until then. | resolve-time (if promoted): the field joins `appSettingsSchema`; `layer()` (settings) resolves it |
| `observability/logger.ts` | stays, named tier | `foundation/observability/logger.ts` | The pino logger + rings + request ALS + `securityEvent`; fan-in ~94, read down by every tier. Imports `env` (down, same tier). | resolve-time: foundation tier |
| `observability/tracing.ts` | stays, named tier | `foundation/observability/tracing.ts` | OTel spans + the trace ring + `wrapLibSqlClient`. Imports `errorMessage` (kit, down) + `APP_VERSION` (foundation). `wrapLibSqlClient` is **passed into `createDb` at the composition root** — observability can't be imported from `@orb/db` (cake), so entry injects it. | resolve-time |
| `observability/middleware.ts` | stays, named tier | `foundation/observability/middleware.ts` | The per-request Hono middleware; mounted by `entry/app` (transport/entry reads foundation DOWN). | resolve-time |
| `_shared/audit.ts` — `logAudit` + failure snapshot | → foundation (from the drawer) | `foundation/observability/audit.ts` | fan-in 60/61; an observability concern read down by all (per `shared-dissolution.md §6`). Reads `@orb/db` (down) + `logger` (same tier) + `kit/ids`. Domains call it through the tier order (domain → foundation is downward). | resolve-time: tier order |
| `observability/debug.ts` — routes + auth gate + the structural ports | folds in (from observability) | `foundation/observability/debug/routes.ts` | The `/api/_debug` registrar + the two-tier auth gate; `AssetInspector`/`AdminAuthChecker` stay structural-injection ports (their impls are upward). | resolve-time + compile-time (the ports are structural, no upward import) |
| `observability/debug.ts` — `DEFAULT_CHAT_MODEL_ID` / `DEFAULT_OR_CHAT_MODEL_ID` import | **edge killed** | the constants → `@orb/contracts/connection`; debug reads them DOWN | The **lone `foundation→infra` edge** (`#server/providers`). `§8.1` moves the constants off `providers/index.ts`; default-model-id is connection vocab (cross-boundary). | resolve-time (package dep) + **lint-time** — `no foundation→infra` dep-cruiser rule goes RED if it returns |
| `domain/debug/{service,context,contract,verbs}.ts` | fold into observability | `foundation/observability/debug/` | `debug` is observability, not a business domain (`_FANOUT-BRIEF.md §4`). The 8-slot template does not apply to a foundation read-surface. | resolve-time |
| `domain/debug/persistence/queries.ts` — `tableCounts` / `integrityProbe` / `inspectChatState` | fold in; drop the port | `foundation/observability/debug/inspect/*` (import `@orb/db` directly) | `@orb/db` is a lower package, so foundation may read schema+client down. The `DbInspector` structural port existed only to dodge the upward `domain/debug` reach — unnecessary once the probes live in foundation. | resolve-time (db is a lower package) |
| `server/version.ts` — `APP_VERSION` | stays (residual config) | `foundation/config/version.ts` | A pure constant read down by `tracing` (service version) + `debug/info`. The genuine remainder of `config` after the floor-merge leaves. | resolve-time |
| `server/config/app-config.ts` — `envDefaults`/`layer`/`getAppConfig`/`reloadAppConfig`/cache + `EffectiveAppConfig` + `APP_SETTINGS_KEY` | **NOT foundation** | `domain/settings/effective-config/{layer,cache}.ts`; `EffectiveAppConfig` → `@orb/contracts/settings`; `APP_SETTINGS_KEY` → settings domain | The floor-merge is the read-side twin of `updateAppSettings` and belongs with the tier it resolves (`settings.md`). Foundation owns the env READ (the floor's source), not the env⊕DB resolution. | resolve-time: the resolver moves with the settings domain |
| `server/lifecycle.ts` | DECIDED → `entry/` (per §7 D5) | `entry/lifecycle.ts` | Boot/shutdown protocol — invoked once at the composition root with injected deps, read by entry only, reaches down only to `logger`. NOT "read down by all" → not foundation. The `foundation/lifecycle.ts` alternative is closed. | resolve-time: `entry/` is the top tier (imports flow down) |
| `server/observability/*` — `SerializedSpan` / `RequestTrace` / `RequestRecord` / `AuditFailureSnapshot` / `SpanAttrs` | foundation-internal shapes | `foundation/observability/*` (the `/traces` client reads them as JSON over HTTP, structurally redeclared by probe scripts today) | Not domain types; the client never imports them — it consumes the JSON. Keep foundation-internal; a `contracts/observability` mirror is an Open decision (kills the probe-script structural redeclare). | lint-time: `types-in-contract` is a domain rule; foundation surfaces are tier-internal |

---

## Cross-tier composition (foundation is read DOWN by all; injects UP via structural ports only)

Foundation has **no consumers it injects into** — every other tier *imports* it. The dependency arrows
all point INTO foundation:

| Consumer tier | What it reads from foundation | Via |
|---|---|---|
| every tier (domain/infra/transport/entry) | `env.*` (typed keys) | direct import of `foundation/env` |
| every tier | `getLog()` / `logger` / `securityEvent` / `span` / `setSpanAttrs` / `logAudit` | direct import of `foundation/observability/*` |
| `transport` / `entry` (`app.ts`) | `observability` middleware (mount) + `registerDebugRoutes` | direct import |
| `entry` (boot) | `initTracing()` (before any span opens); `wrapLibSqlClient` (passed into `createDb`); `APP_VERSION` | direct import |

The **only** seams that point the other way are inversion-of-control structural ports — foundation
declares the SHAPE, the composition root supplies the impl (no upward import):

| Port (declared in foundation) | Impl wired by `entry/` | Why a port (not an import) |
|---|---|---|
| `AssetInspector.fsck()` | `domain/assets` `fsck` | `domain/assets` is UP — foundation cannot import it |
| `AdminAuthChecker.isAdmin(headers)` | the auth resolver (adapted) | auth resolution is up-stack; `isAdmin` must never throw |

The DB probes need **no** port (they read `@orb/db` down). `wrapLibSqlClient` is the mirror case: it
lives in foundation but is *handed to* `@orb/db`'s `createDb` at the composition root, because
`@orb/db` may not import `@orb/server`/foundation (cake) — the wrap is injected, not imported.

**Boot ordering (`entry/`):** `initTracing()` runs first (idempotent; lazy-boots in tests).
`reloadEffectiveConfig(db)` (settings, not foundation) then warms the config cache **and rebinds
`logger.level`** — the one place a higher tier reaches back into a foundation singleton's mutable state
(see Esoteric #6).

---

## Spine thread intersections

### §7.1 Identity / auth / permission

`env` owns the entire auth *configuration* surface (nature (a)): `AUTH_MODE` / `AUTH_FALLBACK` /
`OWNER_GROUP` / `OWNER_HANDLES` / the OIDC quintet / `SESSION_SECRET` / the forward-header trust knobs /
`IP_ALLOWLIST` / `EGRESS_FIREWALL` — and the **`superRefine` boot-fatality**: `AUTH_MODE=oidc` without
its five keys, or `=local` without `SESSION_SECRET`+`LOCAL_INITIAL_PASSWORD`, **fails the boot parse**
(a misconfigured deploy must not silently fall back). Foundation reads these down; the *resolution* of
identity lives in the `sessions`/`admin` domains.

**The single-reader rule has sanctioned exceptions, and they are NOT here.** `provisionIdentity` reads
`process.env["RE_DERIVE_ROLE_ON_LOGIN"]` at **call time** (per-test `vi.stubEnv` ergonomics) and the
owner-role trio resolves `OWNER_HANDLES` at the consumer — both live in the `sessions` domain, not
`foundation/env`. The gate must allowlist those documented call-time reads.

`securityEvent` (logger) is the **security trail** — one `security:true` line per rejection (SSRF block,
rate-limit, CSRF, auth fail, JWKS reject), deliberately pino-only (the single-operator deploy's audit
surface is the log stream + the ring; a DB security log is intentionally not built). The debug auth gate
is itself identity-load-bearing: admin-cookie short-circuit → `DEBUG_TOKEN` headless fallback; OFF by
default (no token + no admin → 404/deny); the query-param token form was removed (it leaked the secret
into proxy access logs + shell history).

### §7.2 Settings / config (the four natures — foundation owns (a)-read only)

This tier is the **(a) true env** half of the §7.2 spine; the boundary with settings is the headline:

- **(a) true env — OWNED here.** The `process.env` reader, the boot-fatality, the secrets/identity/boot
  keys. Read DOWN by all.
- **(a/seed) env→DB-once** — noted as the pattern the floor generalizes, but the *seed verb*
  (`OPENROUTER_API_KEY` → a labeled `openrouter` credential) runs in `entry/`/the `credentials` domain,
  NOT here. Env only supplies the raw value.
- **(b) runtime toggles → AppSettings — NOT here.** The env⊕DB-override RESOLUTION (`layer()`, the
  cache, `EffectiveAppConfig`) is the **settings domain**. Foundation supplies the env floor's *source*;
  it does not resolve it. The stranded (b) toggles (`RATE_LIMIT_*`, `VLLM_*_CONCURRENCY`) are env-only
  readers here today, candidate AppSettings fields in settings. **`IMPORT_DEFAULT_SOURCE` is the exception
  (D40): not a reader here yet** — DEFERRED to the import slice (its NODE_ENV-conditional default needs a
  post-parse transform), landing in `foundation/env` co-located with its consumer at build; a spec'd
  placeholder comment holds its place in the meantime (explicit deferral, not a silent drop).
- **(c) agent-sdk runtime config — EXCLUDED.** → `infra/providers/backends/agent-sdk`. Foundation has zero
  references to the isolation pins / credential firewall (the `HOST_SECRET_ENV_KEYS` denylist policy
  travels with it).
- **(d) generation params** — `preset`. Not foundation.

**The cross-tier seam:** `logger.level` is rebound by `reloadEffectiveConfig` (settings) on every admin
write — Pino captures `level` at construction, so the foundation logger's level is *mutated* from the
settings tier. This is the one sanctioned higher-tier→foundation-singleton write (Esoteric #6).

### §7.4 Types & schemas — one home, one direction

- `LogLevel` / `LOG_LEVELS` → `@orb/contracts/settings` (foundation/env imports the tuple DOWN for its
  `z.enum`; the hand-kept "mirror env.ts's enum" duplication is eliminated — ONE tuple).
- `EffectiveAppConfig` → `@orb/contracts/settings` (NOT foundation — the resolver is settings').
- `DEFAULT_CHAT_MODEL_ID` / `DEFAULT_OR_CHAT_MODEL_ID` → `@orb/contracts/connection` (kills the
  foundation→infra edge).
- `SerializedSpan` / `RequestTrace` / `SerializedSpanEvent` / `SpanAttrs` / `RequestRecord` /
  `AuditFailureSnapshot` → foundation-internal (the `/traces` + `/db/stats` clients consume the JSON,
  not the types; probe scripts structurally redeclare — an Open decision proposes a `contracts/
  observability` mirror to retire that redeclare).
- `DebugStats` / `IntegrityReport` / `ChatInspection` → `foundation/observability/debug/` internal
  (returned as JSON; no domain type crosses).

### §7.5 String-union dispatch discipline

Foundation is not a dispatch hotspot. The pino numeric-level map (`levelValue` in `debug.ts`) and the
span `"ok" | "error"` status are the only unions; `LogLevel` is `contracts/settings`'. No `assertNever`
sites of note.

---

## Esoteric / load-bearing details

1. **The `env` `superRefine` boot-fatality.** `AUTH_MODE=oidc` (or `=local`) without its required keys
   does not warn-and-degrade — it **fails `envSchema.parse(process.env)` at module load**, crashing
   boot. Deliberate: a half-configured SSO deploy that silently fell back to owner-on-the-public-FQDN
   would be a security incident. MUST survive the move byte-faithfully.

2. **The ONE `process.env` reader discipline + its sanctioned exceptions.** `foundation/env` is the
   sole reader so every consumer dot-accesses a typed key (satisfying `noPropertyAccessFromIndexSignature`
   + Biome `useLiteralKeys` at once). The documented exceptions are NOT here: the call-time
   `RE_DERIVE_ROLE_ON_LOGIN` + owner-role reads live in `sessions`; the gate must allowlist them.

3. **`dotenv override:true` + the two escape hatches.** A checked-in dev `.env` wins over a stale shell
   export — EXCEPT under `VITEST` (the runner pins deterministic auth env) and `NEO_ENV_NO_OVERRIDE=1`
   (the probe-script out so `DEBUG_TOKEN=… PORT=… tsx index.ts` honors shell vars). Both are
   load-bearing for test determinism + one-off server fires.

4. **Audit never breaks the primary channel (suppress → count → drop).** `logAudit` wraps the insert in
   try/catch: a disk-full/db-locked failure pre-fix bubbled through 38 call sites and 500'd the user's
   real op (delete a chat, save a setting). Now it logs at `error`, increments the sticky counter, and
   drops. Every 25th drop (`ALERT_EVERY`) trips a `security:true` `audit_sustained_failure` **warn** so
   a sustained outage surfaces without polling. The window is process-lifetime (cleared by restart, not
   by a success).

5. **The in-memory rings ASSUME single-replica.** The log ring (2000), request ring (500), trace ring
   (500), and the audit failure window are all module-scope, per-process. An admin browsing
   `/api/_debug` on a multi-replica deploy would see only the replica they hit. Same posture as
   credentials' `health/cache.ts` / settings' `effective-config/cache.ts` — carry the
   `ASSUMES(single-replica)` annotation; the rings are the seam to externalize if that's ever reversed.

6. **`logger.level` rebind on settings reload (cross-tier).** Pino captures `level` at construction; the
   `AppSettings.logLevel` override would be a docs-only knob (effective at restart) without
   `reloadEffectiveConfig` (settings) setting `logger.level` on every reload. The foundation logger is
   the *target*; the settings tier owns the *trigger* — the one sanctioned higher-tier write into a
   foundation singleton.

7. **The pino multistream per-destination level.** Each `multistream` destination needs its OWN level —
   without it pino defaults streams to `info` and silently **drops** debug logs even when the logger
   level is `debug`, making every per-op `getLog().debug` line unreachable in both stdout and the ring.
   Both destinations tie to `env.LOG_LEVEL`; `dedupe:false`. A regression here is invisible until
   someone needs the debug lines.

8. **`wrapLibSqlClient` binds NON-instrumented methods to the target.** libSQL's `Sqlite3Client` uses
   TC39 private fields (`#checkNotClosed()`) that throw `TypeError` if invoked with the Proxy as `this`.
   Returning `value.bind(target)` for *every* function (instrumented or not) keeps the private-field
   brand check happy so `db.migrate()` / `db.close()` / `db.sync()` keep working transparently. The wrap
   is injected into `@orb/db`'s `createDb` (foundation can't be imported from db — cake).

9. **The trace ring's orphan-bucket eviction.** A post-request fire-and-forget span copies an
   already-sealed parent's `neo.requestId` and would re-create a bucket that never gets a root and never
   evicts → unbounded growth. Two guards: `MAX_LIVE_BUCKETS` (2000) drops the oldest in-progress bucket
   on breach, and the bounded `sealed` set drops late orphans for already-sealed requests. The seal-time
   eviction reads the OUTGOING record at `head` first (a prior bug deleted the wrong slot, 404'ing the
   genuinely-evicted trace).

10. **The `span()` parent-attr internal cast.** Child spans copy `neo.requestId` off the parent via
    `(parent as { attributes? }).attributes` — `attributes` is the SDK concrete-span property, NOT the
    public OTel `Span` interface. If a future OTel renames it the cast yields `undefined` and the child
    lands without `neo.requestId` — it **degrades gracefully** (missing from its bucket; traces still
    record), never throws. Keep the fallback intact.

11. **The debug failure-snapshot / single-replica assumption + the `X-Request-Id` charset guard.** The
    `SAFE_REQUEST_ID` regex (`/^[A-Za-z0-9_.\-:]{1,128}$/`) caps reuse-from-header so a client can't
    inject log-line content or terminal escapes via a malicious `X-Request-Id`; a mismatch generates a
    fresh UUID. (Caddy's hex + tRPC UUIDs both pass.)

12. **RP content NEVER reaches a log line or span attribute.** The doctrine: logs/spans are METADATA,
    RP content lives in the DB. The pino `redact` paths (top-level + one-level `*.x` wildcards — pino
    redact is NOT recursive, so `*.apiKey`/`*.ciphertext` are defense-in-depth) and the `MAX_ATTR_LEN`
    (512) truncation belt enforce it; current call sites are disciplined (log `credentialId`/`source`,
    never plaintext).

---

## Invariants (gate candidates)

1. **`foundation/env` is the ONLY `process.env` reader.**
   *Enforcement: lint-time — a dep-cruiser/`check` rule asserts no `process.env` access outside
   `foundation/env`; the documented call-time exceptions (`sessions` owner-role reads) are allowlisted.*

2. **Foundation reaches UP to NOTHING — no `foundation → domain` or `foundation → infra` import.**
   *Enforcement: resolve-time (package deps — foundation declares only kit/contracts/db) + lint-time —
   a `no foundation→infra/domain` dep-cruiser rule; the killed `DEFAULT_*_MODEL_ID` edge is the canary
   (its return goes RED).*

3. **The `env` `superRefine` boot-fatality survives.**
   *Enforcement: test-time — `AUTH_MODE=oidc` with a missing OIDC key throws at parse; `=local` without
   `SESSION_SECRET`/`LOCAL_INITIAL_PASSWORD` throws.*

4. **Audit never breaks the primary channel (suppress → count → drop).**
   *Enforcement: test-time — a forced `db.insert` rejection inside `logAudit` does NOT throw to the
   caller; the failure counter increments and the 25th drop emits the sustained-failure warn.*

5. **RP content never reaches a log line or a span attribute.**
   *Enforcement: lint-time — the `redact` path set + a no-RP-fields convention; test-time — a span
   attribute over `MAX_ATTR_LEN` is truncated and a redacted key censors.*

6. **`wrapLibSqlClient` binds non-instrumented methods to the target.**
   *Enforcement: test-time — `db.migrate()` / `db.close()` invoked through the proxy do NOT throw the
   private-field `TypeError`; an instrumented `execute` produces a `db.execute` span.*

7. **The in-memory rings + audit window carry `ASSUMES(single-replica)`.**
   *Enforcement: lint-time — a `check` gate validates the annotation on the module-scope ring/counter
   declarations (same pattern as credentials' `health/cache.ts`).*

8. **`logger.level` rebinds on every settings reload.**
   *Enforcement: test-time — after `reloadEffectiveConfig` with an `AppSettings.logLevel` override,
   `logger.level` equals the override (the cross-tier seam, asserted from the settings side).*

9. **The debug surface is OFF by default.**
   *Enforcement: test-time — with no `DEBUG_TOKEN` and no admin checker wired, `/api/_debug/*` returns
   404; with a token, a wrong `x-debug-token` returns 401; `isAdmin` throwing does NOT open the gate.*

10. **The floor-merge is NOT in foundation.**
    *Enforcement: resolve-time — `foundation/config` contains no `app-config.ts`/`layer()`/
    `EffectiveAppConfig` resolver; the resolver resolves from `domain/settings`. Lint-time — a
    foundation file referencing `EffectiveAppConfig`'s resolver is RED.*

11. **The foundation↑ seams are structural-injection ports (inversion of control), not imports.**
    *Enforcement: compile-time — `AssetInspector`/`AdminAuthChecker` are interfaces declared in
    foundation; `entry/` supplies the impls; no `foundation → domain/assets` or `foundation → auth`
    source import exists.*

---

## CONFLICT check vs `settings.md` (no conflicts — this doc defers)

`settings.md` rules the floor-merge (`app-config.ts` → the settings domain's `effective-config/`
subsystem), `EffectiveAppConfig` → `@orb/contracts/settings`, `APP_SETTINGS_KEY` → settings domain, and
states "foundation owns env READING + observability." **This doc takes exactly that boundary** — it
claims env-read + observability + the residual `version` constant, and explicitly disclaims the
floor-merge, `EffectiveAppConfig`, `APP_SETTINGS_KEY`, and `LOG_LEVELS`/`LogLevel` (which it reads DOWN
from `contracts/settings`). The stranded-(b)-toggle promotion is deferred to `settings.md`'s Open
decisions (this doc only locates the env READER). No double-claim.

---

## Open decisions

- **`lifecycle.ts` — DECIDED: `entry/lifecycle.ts`** (per DECISIONS-LEDGER §7 D5; no longer open). The
  boot/shutdown protocol is the composition root's (injected deps, read by entry only, not
  read-down-by-all), NOT `foundation/lifecycle.ts`. The foundation alternative is closed; the
  one-directional invariant holds.
- **A `contracts/observability` mirror for `SerializedSpan` / `RequestTrace`.** Today three probe
  scripts + the `/traces` client structurally redeclare these (a drift hazard the source comments flag).
  Promoting them to `@orb/contracts/observability` retires the redeclare at the cost of a contracts
  namespace for a single-operator debug surface. Lean: defer until the client genuinely type-imports them.
- **Drop the `DbInspector` structural port.** Now that the DB probes live in foundation and read
  `@orb/db` down, the port is unnecessary. Lean: drop it; keep `AssetInspector` + `AdminAuthChecker`
  (those remain genuine upward seams).
- **`HOST_SECRET_ENV_KEYS` denylist split.** The `process.env`-reading baseline producer stays in
  `env`; the *denylist contents* (the credential-firewall policy) belong with `infra/providers/backends/agent-sdk`.
  Confirm the seam: does env expose a raw `processEnvSnapshot()` and claude-sdk compose the denylist, or
  does env keep `hostEnvForClaudeChild` whole? Lean: env exposes the snapshot; the firewall owns the policy.
- **`DEFAULT_*_MODEL_ID` destination — DECIDED: `@orb/contracts/connection`** (connection vocab; kills
  the lone foundation→infra edge). (ledger R8; `domains/connection.md`.)
- **Metrics — leave as trace-totals or add a real module?** There is no metrics module today; metrics
  are the per-trace totals + ring timing. For a single-operator deploy that suffices. Lean: no separate
  module unless an external metrics sink is ever wanted (the `RingExporter` is the OTLP-replaceable seam).
