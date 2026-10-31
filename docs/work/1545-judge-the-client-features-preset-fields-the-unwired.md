---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/preset fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/preset`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `MarkerCopy.templateNoteDetail.label` | `client/src/features/preset/components/prompt-assembly/marker-copy.ts:43` | never-read | delete | delete the field and its writes (`client/src/features/preset/components/prompt-assembly/marker-copy.ts:68`) |
| `MarkerCopy.templateNoteDetail.text` | `client/src/features/preset/components/prompt-assembly/marker-copy.ts:43` | never-read | delete | delete the field and its writes (`client/src/features/preset/components/prompt-assembly/marker-copy.ts:68`) |
| `DefaultPresetPatchVars.section` | `client/src/features/preset/hooks/use-preset-mutations.ts:64` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `DefaultPresetPatchVars.patch` | `client/src/features/preset/hooks/use-preset-mutations.ts:65` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `DefaultPresetPatchVars.patch.defaultPresetId` | `client/src/features/preset/hooks/use-preset-mutations.ts:65` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `ToggleItem.value` | `client/src/features/preset/lib/assembly-model.ts:143` | unreferenced | delete | delete the field |
| `ToggleItem.label` | `client/src/features/preset/lib/assembly-model.ts:144` | unreferenced | delete | delete the field |
| `GuidedFooterState.isEmpty` | `client/src/features/preset/lib/assembly-model.ts:222` | never-read | delete | delete the field and its writes (`client/src/features/preset/lib/assembly-model.ts:229`) |
| `GuidedFooterState.isDefault` | `client/src/features/preset/lib/assembly-model.ts:223` | never-read | delete | delete the field and its writes (`client/src/features/preset/lib/assembly-model.ts:230`) |
| `QualityOption.description` | `client/src/features/preset/lib/capability-panel-model.ts:134` | unreferenced | delete | delete the field |
| `metadataSchema.macroRowIds` | `client/src/features/preset/lib/preset-editor-values.ts:10` | unreferenced | delete | delete the key |
| `ReadFailure.message` | `client/src/features/preset/lib/resolve-failure.ts:38` | unreferenced | delete | delete the field |
| `ReadFailure.data` | `client/src/features/preset/lib/resolve-failure.ts:42` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
