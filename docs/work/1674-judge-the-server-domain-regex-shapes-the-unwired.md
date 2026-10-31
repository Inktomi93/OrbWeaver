---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/regex shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/regex`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ListForChatParams` / `ListCheckpointsParams` | `server/src/domain/regex/contract/params.ts:140` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListForChatParams` / `ReadGameParams` | `server/src/domain/regex/contract/params.ts:140` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListForChatParams` / `DetachDanglingPointerParams` | `server/src/domain/regex/contract/params.ts:140` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListForChatParams` / `ResyncFromStoryParams` | `server/src/domain/regex/contract/params.ts:140` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRoomDisplayScriptsParams` / `ListCheckpointsParams` | `server/src/domain/regex/contract/params.ts:146` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRoomDisplayScriptsParams` / `ReadGameParams` | `server/src/domain/regex/contract/params.ts:146` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRoomDisplayScriptsParams` / `DetachDanglingPointerParams` | `server/src/domain/regex/contract/params.ts:146` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRoomDisplayScriptsParams` / `ResyncFromStoryParams` | `server/src/domain/regex/contract/params.ts:146` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
