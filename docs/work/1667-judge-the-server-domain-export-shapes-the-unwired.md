---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/export shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/export`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ExportCardFormat` / `ExportCardFormat` | `server/src/domain/export/index.ts:5` | reexport-chain | delete | export it from its home, not through `server/src/domain/export/contract/service.ts` |
| `ExportChatFormat` / `ExportChatFormat` | `server/src/domain/export/index.ts:5` | reexport-chain | delete | export it from its home, not through `server/src/domain/export/contract/service.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 2 rows = 2 applied. 0 kept, 0 handed off, 0 owner questions.

- `ExportCardFormat`, `ExportChatFormat` reexport-chain: applied. `domain/export/index.ts` exports both from their home `contract/params.ts`; the `contract/service.ts` re-export (and its comment) is deleted. ast-grep over ts 5949 and tsx 1525 tracked files shows the only users are `contract/params.ts`, the door, and `entry/http/export.ts`, which imports through the door, so no importer changed.
