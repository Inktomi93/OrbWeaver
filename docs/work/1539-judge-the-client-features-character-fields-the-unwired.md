---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/character fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/character`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `FacetDetailProps.characterId` | `client/src/features/character/components/character-facet-inspector.tsx:147` | never-read | delete | delete the field and its writes (`client/src/features/character/components/character-facet-inspector.tsx:121`) |
| `CharacterRefinery.analysis` | `client/src/features/character/components/character-provenance-section.tsx:14` | unreferenced | delete | delete the field |
| `UpdateLibraryVars.section` | `client/src/features/character/components/library-settings-section.tsx:24` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateLibraryVars.patch` | `client/src/features/character/components/library-settings-section.tsx:25` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateLibraryVars.patch.pageSize` | `client/src/features/character/components/library-settings-section.tsx:25` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
