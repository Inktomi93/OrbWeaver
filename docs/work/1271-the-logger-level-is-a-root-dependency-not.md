---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: server
---

# The logger level is a root dependency, not a module-load read

## What

`packages/server/src/foundation/observability/logger.ts` sets its level at module load from the process env, the one reader left outside the composition root after item 1254; `docs/law/Tier-2-Foundation.md` records the exemption. The harness works around it with `borrowLogLevel` in `tests/support/node/server.ts`, swapping the shared logger's level per root, which two roots in one worker can race.

## Why

A module-load read is a seam no root can set, and a borrowed global is shared state between test roots in the same worker.

## Done when

The logger instance or its level is created at the composition root from the record and passed to the services that log; no module under `packages/server/src` reads the level at import; `borrowLogLevel` is deleted; the Tier-2 exemption sentence is removed; the dependency-cruiser rule `process-env-composition-root-only` loses its logger exception and a planted import in the logger fails it.

## Plan

The shape is a logger instance per root, injected. It is too large for one lane, so it runs in the legs below. Not yet built.

Survey of `packages/server/src` (`ast-grep`, `.ts` and `.tsx`), the sizing evidence for the split:

| Use | Call sites | Files |
| - | - | - |
| `getLog()` | 198 | 111 |
| `securityEvent(...)` | 61 | 16 |
| `logger.<method>(...)` | 36 | 9 |
| `logger.level =` (`domain/settings/effective-config/cache.ts`) | 1 | 1 |

The union is 130 files: `domain` 78 across 19 domains, `entry` 23, `transport` 11, `infra` 10, `foundation` 8.

The shape:

1. `foundation/observability/logger.ts` exports a `createLogger(level)` with the current pino options and destinations. It holds no module-level logger. The log and request rings stay process-scope.
2. `ServicesDeps` gains the logger. `createProcessSeams` builds it from `env.LOG_LEVEL`; a test root builds one from its own record.
3. The request scope children off the root's logger. `getLog()` keeps the request-scoped read and loses its base-logger fallback.
4. Every site that logs outside a request takes the logger from its deps. The foundation helpers that log (`superviseDetached`, `logAudit`, the memory and client-error logs, the debug probes) take it as a parameter.
5. The settings cache rebinds the logger it is handed, so an admin override moves only that root's logger.

The legs:

- [x] Foundation and infra helpers, the `ServicesDeps` field and the root wiring.
- [ ] `transport` and `entry`.
- [ ] Domain contexts, split by domain across two or three legs.
- [ ] Delete the module logger, the `getLog()` fallback and `borrowLogLevel`. Remove the Tier-2 exemption sentence and the dependency-cruiser exception, with a planted control.

Rejected shapes:

- A module logger built at a fixed level that the root rebinds. That is the shared mutable `borrowLogLevel` already is, and two roots in one worker still race.
- An `AsyncLocalStorage` root scope. It covers only work started inside the scope. Direct tRPC callers, timer callbacks and bus subscribers fall back to a process logger, which is the same global.

The race is not only the harness's: the settings cache already writes the process logger's level on every graph's reload.

### Leg 1 landed

`createLogger(level)` builds a root's logger; `ServicesDeps.logger` carries it; `createProcessSeams` builds it from `env.LOG_LEVEL` and `tests/support/node/server.ts` from its own record. `getLog(base)` returns the request's logger, else `base`. `runInRequest(base, …)` children the request scope off `base`. `createDetachedSupervision(log)` and `createAuditWiring(…, log)` bind a root's logger, and `createBackgroundWork`, `createScopedEgress`, `createCas`, `packZip`, `createPluginHost`, the JWKS reader and verifier, the back-channel verifier, the three security notices and `ResolveDeps` take an optional `log`. Compose passes `deps.logger` to every one it builds. `createEffectiveConfigCache` rebinds the logger it is handed.

The module `logger` stays. Every omitted base falls back to it, the settings cache still rebinds it next to the root's, and `borrowLogLevel` still sets its level, so un-migrated sites keep their behavior.

Left for leg 2 (`transport` and `entry`):

- Build `observability` and `observabilityErrorHandler` over the root's logger: export the factories `observeRequest` and `observeThrownRequest` from `foundation/observability/middleware.ts` and mount them in `entry/app.ts`.
- Pass the root's logger where entry builds an infra helper: `createBackgroundWork` in `entry/http/oidc.ts`; `createJwksReader` and `createBackchannelLogoutVerifier` in `entry/http/oidc.ts`; `createHostNotAllowedNotice` in `entry/app.ts`; `createRelayedFallbackNotice`, `createPublicHttpMintNotice` and `ResolveDeps.log` where entry builds them; `registerDebugRoutes`'s `log` option in `entry/app.ts`; `installEgressFirewall` and `superviseDetached` in `entry/lifecycle.ts`; `createCas` in `entry/http/app.ts`; `packZip` in `entry/http/export.ts`; `createScopedEgress` in `entry/compose/share.ts` (its options need the logger first, through `createShareGraph`).
- `recordClientError` in `transport/trpc/router.ts` passes `ctx.logger` once the tRPC context carries it.
- Run the `pass-root-logger` codemod (below) on `packages/server/src/transport` and `packages/server/src/entry`.

Left for leg 3: the domain call sites, `logAudit`'s two `domain/sessions` callers (move them to `createAuditWiring`), and the settings cache's process-logger rebind. Left for leg 4: the plugin broker Worker's sites (`infra/plugin-host/port.ts`, `infra/plugin-host/membrane.ts`), which run in the broker process and need that process's own root logger.

### The `pass-root-logger` codemod

`tooling/src/codemods/pass-root-logger/` rewrites `getLog()` to `getLog(<binder>.logger)` and gives a `securityEvent(...)` call with fewer than four arguments a trailing `<binder>.logger`, filling an absent `fields` with `{}` and an absent `message` with `undefined`. The binder is the nearest enclosing function's parameter named `ctx` or `deps`, as a whole identifier or a top-level shorthand destructure (`({ ctx, input }) =>`). The `binders` and `field` workflow params override both.

Before a leg applies it, that leg's binder types gain the field: the tRPC context and each domain's context or deps interface get `logger`, filled from `ServicesDeps.logger` in compose. Typecheck then names any binder that lacks it.

The dry run against `packages/server/src` before leg 2 would modify 72 files: 50 in `domain`, 15 in `entry` and 7 in `transport`. An independent `ast-grep scan` of the same shapes finds the same 72, and `rg 'getLog\(\)|securityEvent\('` finds 103 files in those tiers. The 31 files only `rg` lists are the codemod's exceptions, and each is a hand edit:

- No binder in scope (module helpers, module-scope statements, a context under another name): `domain/chat/assembly/context.ts`, `domain/chat/bus.ts`, `domain/chat/engine/recover-narrative.ts`, `domain/chat/substrate/prompt-transforms.ts`, `domain/chat/verbs/emit-chat-changed.ts`, `domain/credentials/substrate/decrypt.ts`, `domain/embeddings/indexer/caption.ts`, `domain/embeddings/persistence/queries.ts`, `domain/embeddings/substrate/image-space-degrade.ts`, `domain/import/workload-contributions.ts`, `domain/plugin/substrate/failure-log.ts`, `domain/plugin/substrate/surface-state.ts`, `domain/preset/seed.ts`, `domain/preset/verbs/import.ts`, `domain/refinery/verbs/score-sweep.ts`, `domain/search/verbs/digests.ts`, `domain/settings/seed-themes.ts`, `domain/workloads/engine/boot-reclaim.ts`, `domain/workloads/persistence/queries.ts`, `entry/app.ts`, `entry/boot/boot-owner.ts`, `entry/boot/migrate-data-layout.ts`, `entry/boot/planner-maintenance.ts`, `entry/http/import-tree.ts`, `entry/http/spa.ts`, `entry/index.ts`, `entry/lifecycle.ts`, `transport/rate-limit.ts`, `transport/trpc/chat-events-bus.ts`, `transport/trpc/stream/socket.ts`, `transport/trpc/subscriptions.ts`. Files the codemod does modify can still hold such a site; its dry-run diff names the rest.
- The 35 direct `logger.<method>(...)` calls in 8 files: they bypass the request scope today, so each becomes `<binder>.logger.<method>(...)` by hand, and 19 of them (`domain/rpg/tools/rounds/**`) have no binder in scope.

## Evidence

Filled at landing: what ran and where its output is.
