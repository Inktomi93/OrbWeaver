---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/app-shell fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/app-shell`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `UpdateBackgroundVars.section` | `client/src/features/app-shell/components/appearance-background-section.tsx:37` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateBackgroundVars.patch` | `client/src/features/app-shell/components/appearance-background-section.tsx:38` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateEffectsVars.section` | `client/src/features/app-shell/components/appearance-effects-section.tsx:32` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateEffectsVars.patch` | `client/src/features/app-shell/components/appearance-effects-section.tsx:33` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateReadingVars.section` | `client/src/features/app-shell/components/appearance-reading-section.tsx:39` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateReadingVars.patch` | `client/src/features/app-shell/components/appearance-reading-section.tsx:40` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateSizingVars.section` | `client/src/features/app-shell/components/appearance-sizing-section.tsx:32` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateSizingVars.patch` | `client/src/features/app-shell/components/appearance-sizing-section.tsx:33` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Eight rows: 8 applied (derived), 0 kept, 0 owner questions.

- The four appearance sections (`appearance-background-section.tsx`, `appearance-effects-section.tsx`, `appearance-reading-section.tsx`, `appearance-sizing-section.tsx` under `packages/client/src/features/app-shell/components/`) now type their mutation as `inferInput<Trpc["settings"]["updateUserSettingsSection"]>`. Their `patch` is no longer narrowed to the section's form type; the router declares `patch` as an opaque record (`packages/server/src/transport/trpc/routers/settings.ts:53`).
- Ran: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` (exit 0); `pnpm test:ct tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx tests/client/features/app-shell/components/appearance-sizing-preferences.ct.tsx` (59 passed; the run also reports one error outside any test from the working-tree guard, because this lane edited sibling files while the run was open).
- Reclass list: none.
