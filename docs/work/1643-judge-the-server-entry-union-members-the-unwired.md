---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/entry union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `server/entry`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `NON_PORTABLE_CLASSES.ACCEPTED-LOSSY` | `server/src/entry/contract/portability.ts:5` | unbuilt | delete | delete the member |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Counts: 1 row = 1 deleted.

- `NON_PORTABLE_CLASSES.ACCEPTED-LOSSY`: deleted (`packages/server/src/entry/contract/portability.ts:5`). No `NON_PORTABLE_CANON` row carries it (`packages/server/src/entry/compose/portability.ts:181-298`), it is never stored or sent on the wire, and `docs/adr/0136-portability-r6-an-account-backup-carries-the-room.md` item (G) records that the `chat_tags` row that held it was closed. The doc comment at `packages/server/src/domain/import/contract/service.ts:89` that still named the row was trimmed.
- Survey: codegraph_explore `NON_PORTABLE_CLASSES portability.ts` (one caller; test `tests/server/entry/compose/lifecycle-portability.int.test.ts`, which iterates the tuple and loses nothing); ast-grep `"ACCEPTED-LOSSY"` over `packages tests tooling scripts` with `-l ts` and `-l tsx`: 0 matches in code (5913 `.ts`, 1524 `.tsx` files under `packages tests tooling`); `rg` found the literal only in the ADR.
- Checks: `pnpm typecheck packages/server/tsconfig.json` exit 0; `pnpm test tests/server/entry/compose/lifecycle-portability.int.test.ts` 5 passed. No behavior change, so no red test.
