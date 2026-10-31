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

Filled at landing: what ran and where its output is.
