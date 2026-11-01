---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/data parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/data`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `createCollectionSurface.config.endApproachRows` | `client/src/data/create-collection-surface.ts:81` | unsupplied-prop | delete | delete the prop and its default path (6 calls) |
| `planTreeImport.readText` | `client/src/data/import-tree-plan.ts:343` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Two rows: two applied, none kept, none handed off, no owner questions.

| Row | Result |
| - | - |
| `createCollectionSurface.config.endApproachRows` | applied: config prop removed in `packages/client/src/data/create-collection-surface.ts`; the 12-row threshold is now the one constant `END_APPROACH_ROWS`. `CollectionSurface.listProps.endApproachRows` stays: six surfaces read it (`character-library-body.tsx:172`, `chat-list-surface.tsx:378`, `corpus-browse-view.tsx:183`, `databank-library-surface.tsx:234`, `chats-with-character-pane.tsx:138`) |
| `planTreeImport.readText` | applied: parameter removed in `packages/client/src/data/import-tree-plan.ts`; `groupUnits` and `readGroupShape` read `file.text()` directly. The only caller outside tests is `import-tree-served.ts:13` (three arguments); `tests/client/data/import-tree-plan.int.test.ts` calls with two or three and never passes a reader |

Survey: `codegraph_explore` on `createCollectionSurface endApproachRows planTreeImport readText`; `ast-grep -p 'createCollectionSurface($$$A)'` (`-l ts` 5929 files, `-l tsx` 1524 files) with no `endApproachRows` key; literal `rg` for both names read.

Reading `file.text()` directly tripped `orb/wire-json-parsed-at-consumer` on the old cast, so `readGroupShape` now parses the definition with a small zod schema (`GROUP_DEFINITION`); a non-object definition still plans as an empty group.

Proof: client typecheck clean; `tests/client/data/import-tree-plan.int.test.ts` 15 passed; eslint clean on the file.
