---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/workloads fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/workloads`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `UpdateWorkloadsVars.section` | `client/src/features/workloads/components/workloads-tuning-section.tsx:36` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateWorkloadsVars.patch` | `client/src/features/workloads/components/workloads-tuning-section.tsx:37` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `BatchProgress.done` | `client/src/features/workloads/hooks/use-library-import.ts:40` | never-read | delete | delete the field and its writes (`client/src/features/workloads/hooks/use-library-import.ts:216`) |
| `RunWorkloadFormValues.force` | `client/src/features/workloads/lib/workloads-model.ts:225` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RunWorkloadFormValues.dryRun` | `client/src/features/workloads/lib/workloads-model.ts:226` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RunWorkloadFormValues.k` | `client/src/features/workloads/lib/workloads-model.ts:228` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RunWorkloadFormValues.source` | `client/src/features/workloads/lib/workloads-model.ts:230` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CreateScheduleFormValues.force` | `client/src/features/workloads/lib/workloads-schedule-model.ts:47` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CreateScheduleFormValues.dryRun` | `client/src/features/workloads/lib/workloads-schedule-model.ts:48` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CreateScheduleFormValues.k` | `client/src/features/workloads/lib/workloads-schedule-model.ts:49` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CreateScheduleFormValues.source` | `client/src/features/workloads/lib/workloads-schedule-model.ts:50` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

11 rows: 1 deleted, 10 derived, 0 kept, 0 handed off, 0 owner questions.

| Row | Result |
| - | - |
| `UpdateWorkloadsVars.section`, `.patch` | derived: `useUpdateWorkloadsTuning` takes `inferInput<Trpc["settings"]["updateUserSettingsSection"]>` |
| `BatchProgress.done` | deleted with its write (`use-library-import.ts`); `import-library-section.tsx` reads `batch.index` and `batch.total`, and the run total lives on `FolderRun.done` |
| `RunWorkloadFormValues.force`, `.dryRun`, `.k`, `.source` | derived: `save` hands the whole form to `buildStartInput(kind, values: WorkloadRunValues)` (`run-workload-dialog.tsx:109`), which reads the four fields. The interface now extends `WorkloadRunValues` and the twin declarations are gone |
| `CreateScheduleFormValues.force`, `.dryRun`, `.k`, `.source` | derived: same reader (`create-schedule-dialog.tsx:102`); the interface extends `WorkloadRunValues`, and the unused `IndexSource` import went |

Survey: `codegraph_explore` on `UpdateWorkloadsVars … CreateScheduleFormValues`; ast-grep (`-l ts` and `-l tsx`) on `RunWorkloadFormValues` and `CreateScheduleFormValues`. Typecheck exit 0. CT: workloads `platform-action-groups` (run dialog and library import) and `platform-schedule-dialog-dismissal` (schedule form) passed within the 48-test run.
