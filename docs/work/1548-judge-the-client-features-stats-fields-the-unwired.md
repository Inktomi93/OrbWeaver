---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/stats fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/stats`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `MomentumRow.characterId` | `client/src/features/stats/lib/local-calendar-folds.ts:130` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MomentumRow.name` | `client/src/features/stats/lib/local-calendar-folds.ts:131` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MomentumRow.current` | `client/src/features/stats/lib/local-calendar-folds.ts:132` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MomentumRow.prev` | `client/src/features/stats/lib/local-calendar-folds.ts:133` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

4 rows: 2 deleted, 0 derived, 2 kept, 0 handed off, 0 owner questions.

| Row | Result |
| - | - |
| `MomentumRow.current`, `.prev` | deleted with their writes; `delta` is computed from locals |
| `MomentumRow.characterId`, `.name` | kept: `momentumBarItems` reads `row.characterId` and `row.name` (`analytics-view-model.ts:206-208`) through its inline structural parameter, fed by `analytics-overview-surface.tsx:112-113`. That file's header makes the inline shape deliberate, and deriving the parameter from `LocalMomentum` would add a cycle with `local-calendar-folds.ts`, which imports `WEEKDAY_LABELS` from it |

`MomentumRow.delta` was not in the table and stays (read at `analytics-view-model.ts:209` and in the sorts).

Survey: `codegraph_explore` on `MomentumRow local-calendar-folds momentum`; ast-grep (`-l ts` 5904, `-l tsx` 1522 files) on `localMomentum($$$)` (1 caller). Typecheck exit 0 (same command as 1545). CT: `platform-accounting-coverage` mounts the stats components; it does not mount the overview surface, so the delete is proved by typecheck only.
