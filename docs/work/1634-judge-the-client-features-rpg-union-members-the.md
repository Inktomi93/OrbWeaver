---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/rpg union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `client/features/rpg`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `JOURNAL_SCOPES.marks` | `client/src/features/rpg/components/rpg-journal-tab.tsx:74` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Counts: 1 row = 1 kept.

- `JOURNAL_SCOPES.marks`: kept. `<Toggle value="marks">` at `packages/client/src/features/rpg/components/rpg-journal-tab.tsx:344` produces it, `isJournalScope` (line 77) parses it and `SCOPE_BODY.marks` (line 295) renders `JournalMarks`. Deleting it would remove the checkpoint bookmarks scope.
- Survey: codegraph_explore `JOURNAL_SCOPES rpg-journal-tab marks` (callers `isJournalScope`, `RpgJournalTab`, `SCOPE_BODY`, all in the one file); ast-grep `JOURNAL_SCOPES` `-l tsx` over `packages/client/src/features/rpg`, `-l ts` over `packages` and `tests` (no `.ts` match; the symbol is file-local). No stored or wire source: the value is component state.
- No code change.
