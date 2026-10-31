---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/credentials fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/credentials`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `UtilityPresetPatchVars.section` | `client/src/features/credentials/hooks/use-connections-mutations.ts:133` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UtilityPresetPatchVars.patch` | `client/src/features/credentials/hooks/use-connections-mutations.ts:134` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UtilityPresetPatchVars.patch.summarizePreset` | `client/src/features/credentials/hooks/use-connections-mutations.ts:134` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

3 rows: 3 applied, 0 kept, 0 owner questions.

`UtilityPresetPatchVars.section`, `.patch`, `.patch.summarizePreset`: the type is replaced by `inferInput<Trpc["settings"]["updateUserSettingsSection"]>` in `packages/client/src/features/credentials/hooks/use-connections-mutations.ts`.

Ran: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` (exit 0).

Reclass list: none.
