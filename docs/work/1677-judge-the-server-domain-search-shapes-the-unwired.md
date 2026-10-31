---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/search shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/search`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ChatDisplayRow` / `UpdateTitleVars` | `server/src/domain/search/persistence/display.ts:79` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/hooks/use-chat-row-mutations.ts:19`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 1 row = 1 kept with reason. 0 applied, 0 handed off, 0 owner questions.

- `ChatDisplayRow` / `UpdateTitleVars`: kept. `ChatDisplayRow` (`domain/search/persistence/display.ts`) is the server read of a room's title for a search hit; `UpdateTitleVars` is the client mutation input `{ chatId, title }` in `packages/client/src/features/chat/hooks/use-chat-row-mutations.ts`. They share two field names and nothing else: one is a read result with a null-normalised title, the other a write argument. The client cannot import a server type (`docs/law/Core-0-Architecture-and-Structure.md` section 1, principle 1: a package cannot import what is not in its declared deps), and a shared contract type for them would invent a concept. A merge would couple a search read to a rename mutation.
