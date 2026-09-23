---
kind: law
status: active
updated: 2026-09-23
---

# Orbweaver — `foundation`: the base tier (env-read · observability · residual config)

`foundation` is the floor of the server cake — **read DOWN-into by every tier, reaches UP to none.** Three concerns: **env** (the single `process.env` reader), **observability** (logger, tracing, the rings, the audit log, and the `/api/_debug` surface — debug is observability, not a domain), and a nearly-empty **config** (constants). The AppSettings **floor-merge** is NOT here — it is the settings domain's `effective-config/` subsystem; foundation owns env READING only (the floor's *source*), never the env⊕DB resolution.

## What this tier owns

- **`env/` — the ONE `process.env` reader (config nature (a): boot / secret / identity).** The `.env` load (`node:util` `parseEnv` + our explicit override merge — override discipline + escape hatches; not `dotenv`, per the node-26 adoption program §3), the zod `envSchema` parse, the `superRefine` boot-fatality per `AUTH_MODE`, the frozen `env` object, and `processEnvSnapshot()` (the raw baseline the agent-sdk credential firewall spreads — the *denylist policy* is the firewall's, `packages/inference/src/backends/agent-sdk/env.ts`; env only produces the snapshot). Every tier dot-accesses typed keys (`env.PORT`); nothing else touches `process.env` (the `sole-env-reader` gate; sanctioned call-time exceptions: `OWNER_HANDLES`/`OWNER_GROUP`/`RE_DERIVE_ROLE_ON_LOGIN`/`OIDC_ADMIN_GROUPS`/`OIDC_ALLOWED_GROUPS` in `domain/sessions`, allowlisted in the gate).
- **`observability/logger.ts`** — pino + the `LineRing`/`RequestRing` bounded rings backing `/api/_debug` (logs are METADATA — RP content lives in the DB), the `AsyncLocalStorage` request scope (`runInRequest`/`getLog`/`bindRequestUser`), and `securityEvent` (the one greppable `security:true` audit-trail line).
- **`observability/tracing.ts`** — OTel spans (`initTracing`, `span`/`withRequestSpan`/`addSpanEvent`/`setSpanAttrs`), the per-`requestId` `TraceRing` with orphan-bucket eviction, `recentTraces`/`getTraceByRequestId`, and `wrapLibSqlClient` (the libSQL Proxy turning every query into a `db.<method>` span). This IS the metrics surface — metrics are the per-trace totals + request-ring timing; no separate module unless an external sink is ever wanted (the `RingExporter` is the OTLP-replaceable seam).
- **`observability/middleware.ts`** — the per-request Hono middleware: `X-Request-Id` (charset-guarded), request-root span, request-scoped logger, one structured `request` line + ring record. Skips `/api/_debug/*` so introspection doesn't evict real traces.
- **`observability/audit.ts`** — `logAudit` (best-effort; suppress → count → drop) + `getAuditFailureSnapshot`. Writes the `audit_logs` row; never breaks the primary channel.
- **`observability/debug/`** — the `/api/_debug` surface: the two-tier auth gate (admin-cookie short-circuit → `DEBUG_TOKEN` fallback), the registrar, the structural ports (`AssetInspector`, `AdminAuthChecker`), and the read-only DB probes (`inspect/`: `stats` · `integrity` · `inspect-chat`) reading `@orb/db` DOWN (a lower package — no `DbInspector` port needed). The 8-slot domain template does not apply: a foundation read-surface, not a feature.
- **`config/`** — the process constants that are not env. Build identity is not one of them, and is not APP_VERSION: it lives in `version/`, read once at boot and reported on `/healthz`, the boot line and bug reports. That is all — no `app-config.ts`, no `layer()`, no `EffectiveAppConfig` resolver.

NOT owned: the AppSettings floor-merge (→ `domain/settings` `effective-config/`; the `EffectiveAppConfig` type → `@orb/contracts/settings`); agent-sdk runtime config, nature (c) (→ the agent-sdk backend); `errorMessage` and other pure primitives (→ `@orb/kit`); the `CREDENTIALS_KEY_AUTO` auto-key boot path (→ `infra/crypto`; env only supplies the raw `CREDENTIALS_KEY`, validated in crypto, not at boot — a missing key must DEGRADE, never crash); the boot/shutdown protocol (→ `entry/lifecycle.ts`, D5 — invoked once with injected deps, read by entry only, so it fails the read-down-by-all test).

## The defining invariant — foundation reaches UP to NOTHING

Foundation imports only `@orb/kit`, `@orb/contracts`, `@orb/db` (lower packages) and within-tier siblings. A `foundation → domain` or `foundation → infra` import is RED (dep-cruiser `foundation-reaches-up-to-nothing`). An up-stack constant it needs lives in a lower package and is imported DOWN (e.g. `DEFAULT_*_MODEL_ID` in `@orb/contracts/connection`).

Upward pressures resolve by **inversion of control**, never imports:

| Port (declared in foundation) | Impl wired by `entry/` | Why a port |
| - | - | - |
| `AssetInspector.fsck()` | `domain/assets` | assets is UP-stack |
| `AdminAuthChecker.isAdmin(c)` | the auth seam's `debugGateAdmits` verdict, read off the request context | auth resolution is up-stack; it takes the hono `Context` (not headers) and is SYNCHRONOUS ON PURPOSE — the impl must judge the principal the auth middleware ALREADY resolved, since that is the only resolution that saw the raw TCP peer, and a sync signature makes a second, peer-less resolution unwritable. It MUST never throw (a misbehaving seam degrades to deny, never opens the gate) |

The DB probes need no port (`@orb/db` is a lower package). `wrapLibSqlClient` is the mirror case: declared here, *handed to* `createDb` at the composition root (`@orb/db` may not import foundation — cake).

**Boot ordering:** `initTracing()` runs first (idempotent; lazy-boots in tests). `reloadEffectiveConfig(db)` (settings) then warms the config cache **and rebinds `logger.level`** — the one sanctioned higher-tier write into a foundation singleton (detailed below, under "logger.level rebind on settings reload").

## Spine intersections

- **§7.1 identity/auth:** `env` owns the auth *configuration* keys (`AUTH_MODE`/`AUTH_FALLBACK`/`OWNER_*`/the `OIDC_*` set/`SESSION_SECRET`/forward-header trust/`IP_ALLOWLIST`/`EGRESS_FIREWALL`) + the `superRefine` boot-fatality (oidc requires `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`OIDC_REDIRECT_URIS`/`SESSION_SECRET`; local requires `SESSION_SECRET`/`LOCAL_INITIAL_PASSWORD`); identity *resolution* is `domain/sessions` + the entry seam. `securityEvent` is the security trail — one `security:true` line per rejection, deliberately pino-only (the single-operator audit surface is the log stream + ring; a DB security log is intentionally not built). The debug gate is OFF by default (no token + no admin → 404); the query-param token form was removed (it leaked into proxy logs + shell history).
- **§7.2 settings/config:** foundation owns nature (a) READ only. The (a/seed) env→DB-once verb runs in `entry/`+credentials; nature (b) resolution (`layer()`, the cache) is settings'; nature (c) is the agent-sdk backend's; nature (d) generation params are preset's.
- **§7.4 types:** `LOG_LEVELS`/`AUTH_MODES` tuples are imported DOWN from `@orb/contracts`. `SerializedSpan`/`RequestTrace`/`RequestRecord`/`AuditFailureSnapshot` and the debug shapes stay foundation-internal (clients consume the JSON, never the types; a `contracts/observability` mirror is deferred until a client genuinely type-imports them).

## Esoteric / non-obvious details

1. **The `env` `superRefine` boot-fatality.** `AUTH_MODE=oidc` (or `=local`) without its required keys does not warn-and-degrade — it **fails `envSchema.parse` at module load**. Deliberate: a half-configured SSO deploy silently falling back to owner-on-the-public-FQDN would be a security incident. Survives byte-faithfully.

2. **The ONE `process.env` reader discipline.** Sole reader = typed dot-access everywhere. The sanctioned call-time exceptions live in `sessions` (per-test `vi.stubEnv` ergonomics) and are allowlisted in the `sole-env-reader` gate.

3. **`.env` load with `override:true` + the two escape hatches.** A checked-in dev `.env` wins over a stale shell export — EXCEPT under `VITEST` (deterministic auth env) and `ORB_ENV_NO_OVERRIDE=1` (probe scripts honoring shell vars). Both matter for test determinism and one-off server fires. The parser is `node:util`'s `parseEnv`, not `dotenv`; the override MERGE is ours and explicit, because `process.loadEnvFile()` can only ever fill UNSET keys and so cannot express this direction. Asserted both ways in `tests/server/foundation/env/index.test.ts`.

4. **Audit never breaks the primary channel (suppress → count → drop).** A db failure inside `logAudit` logs at `error`, increments the sticky counter, drops; every 25th drop (`ALERT_EVERY`) trips a `security:true` `audit_sustained_failure` warn. Window is process-lifetime.

5. **The in-memory rings ASSUME single-replica.** Log ring (2000), request ring (500), trace ring (500), audit failure window — all module-scope, per-process. Carry `ASSUMES(single-replica)` (the `assumes-single-replica` gate); the rings are the seam to externalize if that's ever reversed.

6. **`logger.level` rebind on settings reload.** Pino captures `level` at construction; `reloadEffectiveConfig` (settings) sets `logger.level` on every admin write — the one sanctioned higher-tier→foundation-singleton mutation.

7. **The pino multistream per-destination level.** Each `multistream` destination needs its OWN level or pino defaults streams to `info` and silently drops debug lines even when the logger level is `debug`. Both destinations tie to `env.LOG_LEVEL`; `dedupe:false`. `pino-pretty` is dev-only and a PIPE, never a configured transport — the `ringStream` Writable captures the serialized line on the main thread; a worker-thread transport would double-serialize and starve the ring.

8. **`wrapLibSqlClient` binds NON-instrumented methods to the target.** libSQL's client uses TC39 private fields that throw `TypeError` if invoked with the Proxy as `this`; returning `value.bind(target)` for every function keeps `migrate()`/`close()`/`sync()` working. The wrap is injected into `createDb` (cake).

9. **The trace ring's orphan-bucket eviction.** A post-request fire-and-forget span copying a sealed parent's `orb.requestId` would re-create a never-evicting bucket. Guards: `MAX_LIVE_BUCKETS` (2000) drops the oldest in-progress bucket, and the bounded `sealed` set drops late orphans. Seal-time eviction reads the OUTGOING record at `head` first (a prior bug deleted the wrong slot).

10. **The `span()` parent-attr internal cast.** Child spans copy `orb.requestId` via `(parent as { attributes? }).attributes` — an SDK concrete-span property, not public OTel API. If OTel renames it, the child degrades gracefully (lands without the id; traces still record), never throws. Keep the fallback.

11. **The `X-Request-Id` charset guard.** `SAFE_REQUEST_ID` (`/^[A-Za-z0-9_.\-:]{1,128}$/`) caps reuse-from-header so a client can't inject log content or terminal escapes; mismatch → fresh UUID.

12. **RP content NEVER reaches a log line or span attribute.** Logs/spans are METADATA. The pino `redact` paths (top-level + one-level `*.x` wildcards — pino redact is NOT recursive, so `*.apiKey`/`*.ciphertext` are defense-in-depth) and `MAX_ATTR_LEN` (512) truncation enforce it; call sites log `credentialId`/`source`, never plaintext.

## Invariants

1. **`foundation/env` is the ONLY `process.env` reader.** *(`sole-env-reader` gate; five allowlisted sessions keys.)*
2. **Foundation reaches UP to nothing.** *(resolve-time deps + dep-cruiser `foundation-reaches-up-to-nothing`.)*
3. **The `superRefine` boot-fatality holds.** *(test-time.)*
4. **`logAudit` never throws to the caller; the 25th drop warns.** *(test-time.)*
5. **RP content never logged; redact + attr truncation hold.** *(lint + test-time.)*
6. **The rings carry `ASSUMES(single-replica)`.** *(`assumes-single-replica` gate.)*
7. **The debug surface is OFF by default** — no `DEBUG_TOKEN` + no admin → 404; wrong token → 401; `isAdmin` throwing does NOT open the gate. *(test-time.)*
8. **The floor-merge is NOT in foundation; the foundation↑ seams are structural ports, not imports.** *(resolve-time + review.)*
