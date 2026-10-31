---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/automation shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/automation`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ExecutePluginSuggestion` / `ExecutePluginSuggestion` | `server/src/domain/automation/contract/ops.ts:47` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `RulePresetProvenance` / `RosterPresetRuleView` | `server/src/domain/automation/contract/params.ts:60` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/roster-preset/index.ts:112`; a shape that matches by coincidence stays |
| `ResolveStreamAuthorityParams` / `ListActiveForChatParams` | `server/src/domain/automation/contract/params.ts:156` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ResolveStreamAuthorityParams` / `ListForChatParams` | `server/src/domain/automation/contract/params.ts:156` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ResolveStreamAuthorityParams` / `ListRoomDisplayScriptsParams` | `server/src/domain/automation/contract/params.ts:156` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ResolveStreamAuthorityParams` / `ListCheckpointsParams` | `server/src/domain/automation/contract/params.ts:156` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ResolveStreamAuthorityParams` / `ReadGameParams` | `server/src/domain/automation/contract/params.ts:156` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ResolveStreamAuthorityParams` / `DetachDanglingPointerParams` | `server/src/domain/automation/contract/params.ts:156` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ResolveStreamAuthorityParams` / `ResyncFromStoryParams` | `server/src/domain/automation/contract/params.ts:156` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
