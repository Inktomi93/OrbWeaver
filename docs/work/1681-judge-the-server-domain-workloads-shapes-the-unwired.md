---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/workloads shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/workloads`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `StartWorkloadParams` / `StartWorkloadParams` | `server/src/domain/workloads/contract/params.ts:5` | reexport-chain | delete | export it from its home, not through `contracts/src/workloads/index.ts` |
| `CancelWorkloadResult` / `CancelWorkloadResult` | `server/src/domain/workloads/contract/params.ts:32` | reexport-chain | delete | export it from its home, not through `contracts/src/workloads/index.ts` |
| `WorkloadRowAnyKind` / `WorkloadRowAnyKind` | `server/src/domain/workloads/contract/workload-row.ts:52` | reexport-chain | delete | export it from its home, not through `contracts/src/workloads/index.ts` |
| `WorkloadRunnableRow` / `WorkloadRunnableRow` | `server/src/domain/workloads/contract/workload-row.ts:52` | reexport-chain | delete | export it from its home, not through `contracts/src/workloads/index.ts` |
| `ScheduleTickDeps` / `ScheduleTickAssemblyDeps` | `server/src/domain/workloads/index.ts:10` | renamed-reexport | delete | use the home name `ScheduleTickAssemblyDeps` |
| `ReapWorkloadsArgs` / `ReapWorkloadsAssemblyArgs` | `server/src/domain/workloads/index.ts:12` | renamed-reexport | delete | use the home name `ReapWorkloadsAssemblyArgs` |
| `WorkloadRunnerDeps` / `WorkloadRunnerAssemblyDeps` | `server/src/domain/workloads/index.ts:14` | renamed-reexport | delete | use the home name `WorkloadRunnerAssemblyDeps` |
| `WorkloadRowAnyKind` / `WorkloadRowAnyKind` | `server/src/domain/workloads/index.ts:18` | reexport-chain | delete | export it from its home, not through `server/src/domain/workloads/contract/workload-row.ts`, `contracts/src/workloads/index.ts` |
| `WorkloadRunnableRow` / `WorkloadRunnableRow` | `server/src/domain/workloads/index.ts:18` | reexport-chain | delete | export it from its home, not through `server/src/domain/workloads/contract/workload-row.ts`, `contracts/src/workloads/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
