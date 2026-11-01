---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/character parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/character`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CharacterLibrarySurface.#0.ariaLabel` | `client/src/features/character/surfaces/character-library-surface.tsx:132` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

One row: one applied, none kept, none handed off, no owner questions.

| Row | Result |
| - | - |
| `CharacterLibrarySurface.#0.ariaLabel` | applied: props interface and parameter removed in `packages/client/src/features/character/surfaces/character-library-surface.tsx`; the body receives the literal `Character library`. The one mount is `<CharacterLibrarySurface />` at `packages/client/src/features/character/lib/characters-section.tsx:63` |

Survey: `codegraph_explore` on the symbol; literal `rg` for `CharacterLibrarySurface`, `CharacterLibrarySurfaceProps`, `ariaLabel` over `packages tests tooling scripts` (the component is not passed as a value anywhere). Proof: client typecheck clean.
