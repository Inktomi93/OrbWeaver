---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/discovery shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/discovery`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ThemeLevel` / `ThemeLevel` | `server/src/domain/discovery/contract/params.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/discovery/index.ts` |
| `Archetype` / `Archetype` | `server/src/domain/discovery/contract/results.ts:84` | reexport-chain | delete | export it from its home, not through `contracts/src/discovery/index.ts` |
| `ArchetypeMember` / `ArchetypeMember` | `server/src/domain/discovery/contract/results.ts:85` | reexport-chain | delete | export it from its home, not through `contracts/src/discovery/index.ts` |
| `ModelRoutingRow` / `ModelRoutingRow` | `server/src/domain/discovery/contract/results.ts:108` | reexport-chain | delete | export it from its home, not through `contracts/src/discovery/index.ts` |
| `ThemeRow` / `ThemeRow` | `server/src/domain/discovery/contract/results.ts:120` | reexport-chain | delete | export it from its home, not through `contracts/src/discovery/index.ts` |
| `VisualArchetype` / `VisualArchetype` | `server/src/domain/discovery/contract/results.ts:122` | reexport-chain | delete | export it from its home, not through `contracts/src/discovery/index.ts` |
| `THEME_LEVELS` / `THEME_LEVELS` | `server/src/domain/discovery/index.ts:26` | reexport-chain | delete | export it from its home, not through `contracts/src/discovery/index.ts` |
| `DiscoveryContext` / `DiscoveryAssemblyContext` | `server/src/domain/discovery/index.ts:29` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `HubVector` / `HubRow` | `server/src/domain/discovery/persistence/embed-store-reads.ts:68` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/discovery/verbs/compute-hub-scores.ts:26`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
