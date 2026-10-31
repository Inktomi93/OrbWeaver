---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/settings fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/settings`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ThemeInsert.ownerId` | `server/src/domain/settings/persistence/theme-queries.ts:18` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemeInsert.name` | `server/src/domain/settings/persistence/theme-queries.ts:19` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemeInsert.override` | `server/src/domain/settings/persistence/theme-queries.ts:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemeInsert.css` | `server/src/domain/settings/persistence/theme-queries.ts:21` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemeInsert.createdAt` | `server/src/domain/settings/persistence/theme-queries.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemeInsert.updatedAt` | `server/src/domain/settings/persistence/theme-queries.ts:23` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemePatch.name` | `server/src/domain/settings/persistence/theme-queries.ts:27` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemePatch.override` | `server/src/domain/settings/persistence/theme-queries.ts:28` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemePatch.css` | `server/src/domain/settings/persistence/theme-queries.ts:29` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemePatch.updatedAt` | `server/src/domain/settings/persistence/theme-queries.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

No row is dead. All ten are kept. Each value is handed whole to drizzle, which reads every key as a column.

| Rows | Reader |
| - | - |
| `ThemeInsert.ownerId`, `.name`, `.override`, `.css`, `.createdAt`, `.updatedAt` | `insertTheme` (`.values(row)`) and `insertThemes` (`.values([...rows])`) in `packages/server/src/domain/settings/persistence/theme-queries.ts` write them into the `themes` table |
| `ThemePatch.name`, `.override`, `.css`, `.updatedAt` | `updateOwnedTheme` (`.set(patch)`) in the same file; `buildThemePatch` in `packages/server/src/domain/settings/verbs/update-theme.ts` builds the patch |

Left as is: `ThemeInsert` and `ThemePatch` are hand-written subsets of `typeof themes.$inferInsert`. Deriving them would loosen the required keys, so they stay as the typed write guard.

- Survey: `codegraph_explore` on `ThemeInsert`, `ThemePatch` and the theme verbs; `rg` over `packages`.
- Reclass: all ten rows move from unknown to kept.
- Ran: no code change, so no typecheck or suite.
