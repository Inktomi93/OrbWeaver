---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/automation fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/automation`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `twistOpSchema.op` | `server/src/domain/automation/contract/analysis.ts:175` | unreferenced | delete | delete the key |
| `twistOpSchema.twist` | `server/src/domain/automation/contract/analysis.ts:175` | unreferenced | delete | delete the key |
| `analysisSuggestionsSchema.text` | `server/src/domain/automation/contract/analysis.ts:181` | unreferenced | delete | delete the key |
| `AnalysisStateMerge.twistsAdded` | `server/src/domain/automation/contract/analysis.ts:322` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnalysisStateMerge.twistsRetired` | `server/src/domain/automation/contract/analysis.ts:323` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnalysisStateMerge.droppedAdds` | `server/src/domain/automation/contract/analysis.ts:325` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RuleStateRead.guidance` | `server/src/domain/automation/contract/analysis.ts:448` | never-read | delete | delete the field and its writes (`server/src/domain/automation/persistence/rule-state.ts:18`) |
| `AutomationImageResult.imageCount` | `server/src/domain/automation/contract/ops.ts:158` | never-read | delete | delete the field and its writes (`server/src/domain/automation/verbs/runtime-ops.ts:53`) |
| `AutomationTurnResult.messageCount` | `server/src/domain/automation/contract/ops.ts:225` | never-read | delete | delete the field and its writes (`server/src/domain/automation/verbs/runtime-ops.ts:25`) |
| `PendingSuggestionBase.summary` | `server/src/domain/automation/contract/ops.ts:598` | never-read | delete | delete the field and its writes (`server/src/domain/automation/substrate/suggestions.ts:204`) |
| `AnalysisConfirmDeps.serialLanes` | `server/src/domain/automation/contract/ops.ts:649` | never-read | delete | delete the field and its writes (`server/src/domain/automation/verbs/confirm-suggestion.ts:158`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Applied: `AnalysisStateMerge.twistsAdded`, `.twistsRetired`, `.droppedAdds` (the twist appliers no longer count), `RuleStateRead.guidance`, `AutomationImageResult.imageCount` and `AutomationTurnResult.messageCount` (both ops resolve void), `PendingSuggestionBase.summary` (the `suggestionRaised` events keep their own summary).

Reclassed to keep:
- `twistOpSchema.op`, `twistOpSchema.twist`, `analysisSuggestionsSchema.text`: keys of the model's structured-output schema, projected to the wire by `projectAnalysisWireSchema` (`packages/server/src/domain/automation/contract/analysis.ts:283`). Deleting one changes the inference request shape and breaks the payload type the appliers read (`op.op`, `op.twist`). Needs an owner decision, not a delete.
- `AnalysisConfirmDeps.serialLanes`: `packages/server/src/domain/automation/substrate/analysis-confirm.ts:38` hands `deps` whole to `applyRuleLoreWrite`, which needs `serialLanes` (`engine/lore-write.ts:42`). Typecheck failed when it was removed. The scan misses the whole-object handoff.

Ran `pnpm test tests/server/domain/automation` (exit 0, 8 files) and `pnpm typecheck packages/server/tsconfig.json` (exit 0). Full typecheck and the rescan run at the end of the lane.
