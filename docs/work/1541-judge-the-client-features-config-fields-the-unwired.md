---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/config fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/config`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `SearchItem.label` | `client/src/features/config/components/config-search-input.tsx:49` | unreferenced | delete | delete the field |
| `SearchItem.haystack` | `client/src/features/config/components/config-search-input.tsx:50` | unreferenced | delete | delete the field |
| `DuplicateThemeVars.id` | `client/src/features/config/hooks/use-theme-mutations.ts:29` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `DuplicateThemeVars.name` | `client/src/features/config/hooks/use-theme-mutations.ts:30` | unreferenced | delete | delete the field |
| `UpdateThemeVars.id` | `client/src/features/config/hooks/use-theme-mutations.ts:39` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateThemeVars.input` | `client/src/features/config/hooks/use-theme-mutations.ts:40` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `RemoveThemeVars.id` | `client/src/features/config/hooks/use-theme-mutations.ts:49` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `SelectThemeVars.section` | `client/src/features/config/hooks/use-theme-mutations.ts:59` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `SelectThemeVars.patch` | `client/src/features/config/hooks/use-theme-mutations.ts:60` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `SelectThemeVars.patch.selectedThemeId` | `client/src/features/config/hooks/use-theme-mutations.ts:60` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
