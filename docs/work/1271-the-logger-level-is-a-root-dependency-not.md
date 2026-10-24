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

The shape is a logger instance per root, injected. It runs in the legs below; legs 1 to 3 are built and leg 4 is not yet built.

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
- [x] `transport` and `entry`.
- [x] Domain contexts.
- [ ] Delete the module logger, the `getLog()` fallback and `borrowLogLevel`. Remove the Tier-2 exemption sentence and the dependency-cruiser exception, with a planted control.

Rejected shapes:

- A module logger built at a fixed level that the root rebinds. That is the shared mutable `borrowLogLevel` already is, and two roots in one worker still race.
- An `AsyncLocalStorage` root scope. It covers only work started inside the scope. Direct tRPC callers, timer callbacks and bus subscribers fall back to a process logger, which is the same global.

The race is not only the harness's: the settings cache already writes the process logger's level on every graph's reload.

### Where legs 1 to 3 leave it

`createLogger(level)` builds a root's logger. `ServicesDeps.logger` carries it: `createProcessSeams` builds it from `env.LOG_LEVEL`, and `tests/support/node/server.ts` builds it from its own record and exposes it as `root.logger`. `getLog(base)` returns the request's logger, else `base`, and `createRequestObservability(log)` children each request off the root's logger in `entry/app.ts`.

Every context and deps type a logging site reads carries a required `logger`, wired from the root: the tRPC context, the domain contexts, the boot, job and HTTP deps. Every `getLog()` and `securityEvent()` site passes it. A module helper takes it as a parameter or in its args. The supervision sites bind `createDetachedSupervision` over it, and the inference runtime receives `deps.logger` itself. `createEffectiveConfigCache` rebinds the logger it is handed, and `runtime-log-level.int.test.ts` proves an override moves it.

Left for leg 4:

- The process logger in `foundation/observability/logger.ts`, the `getLog()` default, `superviseDetached` and `superviseSettled` over it, and the second rebind in `domain/settings/effective-config/cache.ts`.
- The optional `log` on the infra helpers (`createBackgroundWork`, `createScopedEgress`, `createCas`, `packZip`, `PluginHostSeamDeps`, the JWKS reader and verifiers, the security notices, `ResolveDeps`, `DebugRoutesOptions`, `integrityProbe`). Every production caller passes one; some infra suites still omit it.
- `borrowLogLevel` in `tests/support/node/server.ts`, and the first case in `runtime-log-level.int.test.ts`, which reads the process logger.
- The plugin broker Worker (`infra/plugin-host/port.ts`, `infra/plugin-host/membrane.ts`), which runs in the broker process and needs that process's own root logger.
- The Tier-2 exemption sentence and the dependency-cruiser exception, with a planted control.

## Evidence

Legs 1 to 3, on the lane branch before merge:

- `pnpm typecheck` over every program, `pnpm depcruise`, and `pnpm lint:eslint` on every changed file: clean.
- `pnpm test tests/server tests/support/node tests/inference` and the chat-freeze provenance suite: green apart from `router-declaration.repo.int.test.ts`, which then went green once the transport types stopped importing the observability barrel.
- `runtime-log-level.int.test.ts` failed its root-logger case with the cache's root rebind removed, and passed with it restored.

Leg 4 fills the rest: the planted control in the logger and the whole-tree run.
