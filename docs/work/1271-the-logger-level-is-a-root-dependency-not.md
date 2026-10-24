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

## Evidence

Filled at landing: what ran and where its output is.
