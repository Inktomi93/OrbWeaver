---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/refinery fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/refinery`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `StageWarn.outputOver` | `client/src/features/refinery/lib/preflight-warn.ts:27` | never-read | delete | delete the field and its writes (`client/src/features/refinery/lib/preflight-warn.ts:38`) |
| `StageWarn.inputOver` | `client/src/features/refinery/lib/preflight-warn.ts:29` | never-read | delete | delete the field and its writes (`client/src/features/refinery/lib/preflight-warn.ts:38`) |
| `WorkbenchLanes.rewriteRunId` | `client/src/features/refinery/lib/workbench-lanes.ts:95` | never-read | delete | delete the field and its writes (`client/src/features/refinery/lib/workbench-lanes.ts:174`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

3 rows: 3 deleted. 0 derived, 0 kept, 0 handed off, 0 owner questions.

`StageWarn.outputOver`, `.inputOver` and `WorkbenchLanes.rewriteRunId` are gone with their writes. `lane-run-control.tsx:140-189` reads only `warn.message`; `refinery-content-surface.tsx:141-310` reads lanes by name and builds its own `rewriteRunId` from `lanes.rewriteRun`.

Survey: `codegraph_explore` on `StageWarn preflight-warn.ts WorkbenchLanes rewriteRunId workbench-lanes.ts`; ast-grep (`-l ts` and `-l tsx`) on `stageWarnOf($$$)` (2 hits), `workbenchLanesOf($$$)` (1), `$X.rewriteRunId` (6, all wire inputs of other types), `$X.outputOver` (0). Typecheck: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0. CT: refinery `platform-action-groups` mounts the lane run control; with the other item suites, 48 passed, 1 skipped.
