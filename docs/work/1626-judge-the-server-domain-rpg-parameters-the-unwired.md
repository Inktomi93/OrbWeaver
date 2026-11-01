---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/rpg parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/rpg`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `RpgRoundsDeps.connection.resolve.params.actor` | `server/src/domain/rpg/contract/rounds.ts:50` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `RpgRoundsDeps.connection.resolve.params.connectionId` | `server/src/domain/rpg/contract/rounds.ts:50` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `createRpgFlushBarrier.timeoutMs` | `server/src/domain/rpg/flush-barrier.ts:88` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `pick.fallback` | `server/src/domain/rpg/tools/apply.ts:332` | same-literal | delete | inline `""` and drop the parameter (2 calls) |
| `createRpgTraceRecorder.deps.limit` | `server/src/domain/rpg/trace.ts:35` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

5 rows: applied 3, kept 2, handed off 0, owner questions 0.

Applied: `createRpgFlushBarrier.timeoutMs` (the 15 s bound stays as `BARRIER_TIMEOUT_MS`; the one caller is `tools/rounds/observers.ts:88`); `pick.fallback` (both calls, `tools/apply.ts:370-371`, passed `""`; `pick` is now string-only); `createRpgTraceRecorder.deps.limit` (the ring depth stays as `DEFAULT_LIMIT`; the one caller is `entry/compose/services.ts:1176`, and no test builds one).

Kept: `RpgRoundsDeps.connection.resolve.params.actor` and `.connectionId`. The param type is the shared inference `ResolveTaskParams`; the rpg callers pass `{ task, principal }`, but the same type is the runtime resolve's input, which reads both (`packages/inference/src/contract/task-resolution.ts`, `resolve/resolve-task.ts`). Narrowing the rpg dep alone needs a new `Pick` type, which is a design call, not a delete.

Survey: codegraph_explore on RpgRoundsDeps, createRpgFlushBarrier, createRpgTraceRecorder, pick; ast-grep on createRpgFlushBarrier, createRpgTraceRecorder and pick, -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1, 1 and 2 calls; literal `rg` for timeoutMs, limit and the three names in tests: no writer.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` delta-own-keys, tracker-delta-snapshot, authority.suite, corpus-rpg-flight: passed.
