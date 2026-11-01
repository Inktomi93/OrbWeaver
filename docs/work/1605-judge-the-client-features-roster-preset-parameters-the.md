---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/roster-preset parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/roster-preset`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `useRulePresetCatalogue.enabled` | `client/src/features/roster-preset/hooks/use-saved-rosters.ts:91` | same-literal | delete | inline `true` and drop the parameter (3 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

One row: one applied, none kept, none handed off, no owner questions.

`useRulePresetCatalogue` in `packages/client/src/features/roster-preset/hooks/use-saved-rosters.ts` takes no parameter and runs the query unconditionally. The three callers (`use-start-roster.ts:32`, `roster-picker.tsx:269`, `roster-member-surface.tsx:84`) passed `true`; `enabled` is a query gate with no design-system axis. Literal `rg` over `packages tests tooling scripts` shows no other caller. Proof: client typecheck clean; roster-preset CTs in the lane report.
