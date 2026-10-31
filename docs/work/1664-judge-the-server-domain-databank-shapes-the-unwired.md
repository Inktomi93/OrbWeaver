---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/databank shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/databank`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ListActiveForChatParams` / `ListForChatParams` | `server/src/domain/databank/contract/params.ts:163` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListActiveForChatParams` / `ListRoomDisplayScriptsParams` | `server/src/domain/databank/contract/params.ts:163` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListActiveForChatParams` / `ListCheckpointsParams` | `server/src/domain/databank/contract/params.ts:163` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListActiveForChatParams` / `ReadGameParams` | `server/src/domain/databank/contract/params.ts:163` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListActiveForChatParams` / `DetachDanglingPointerParams` | `server/src/domain/databank/contract/params.ts:163` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListActiveForChatParams` / `ResyncFromStoryParams` | `server/src/domain/databank/contract/params.ts:163` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DatabankPortabilityContext` / `DatabankPortabilityAssemblyContext` | `server/src/domain/databank/index.ts:6` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `DatabankContext` / `DatabankAssemblyContext` | `server/src/domain/databank/index.ts:7` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
