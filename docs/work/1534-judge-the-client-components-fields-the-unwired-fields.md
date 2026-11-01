---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/components fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/components`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `FormDialogSubmit.cancelLabel` | `client/src/components/form-dialog.tsx:28` | never-written | delete | delete the field and the branch that reads its default at `client/src/components/form-dialog.tsx:148` |
| `FormDialogSubmit.tone` | `client/src/components/form-dialog.tsx:30` | never-written | delete | delete the field and the branch that reads its default at `client/src/components/form-dialog.tsx:149` |
| `ResetLeafVars.section` | `client/src/components/use-config-leaf.ts:60` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `ResetLeafVars.patch` | `client/src/components/use-config-leaf.ts:61` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

All four rows applied (counts: 4 applied, 0 kept, 0 owner questions).

- `FormDialogSubmit.cancelLabel` and `.tone`: deleted with their default branches in `packages/client/src/components/form-dialog.tsx`. An ast-grep pair scan for `cancelLabel` (`-l ts` and `-l tsx`) found no writer. A `tone` pair scan over `packages/client` and `tests/client` found only unrelated badge tables.
- `ResetLeafVars`: replaced by `inferInput<Trpc["settings"]["updateUserSettingsSection"]>` in `packages/client/src/components/use-config-leaf.ts`.
- Ran: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` (exit 0); `pnpm test:ct tests/client/components/platform-form-dialog.suite.ct.tsx` (exit 0).
- Reclass list: none.
