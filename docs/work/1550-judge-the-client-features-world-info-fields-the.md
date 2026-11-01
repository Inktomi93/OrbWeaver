---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/world-info fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/world-info`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `BookDetailsPatch.name` | `client/src/features/world-info/components/book-details-dialog.tsx:19` | never-read | delete | delete the field and its writes (`client/src/features/world-info/components/book-details-dialog.tsx:58`) |
| `BookDetailsPatch.description` | `client/src/features/world-info/components/book-details-dialog.tsx:21` | never-read | delete | delete the field and its writes (`client/src/features/world-info/components/book-details-dialog.tsx:58`) |
| `UpdateWorldInfoVars.section` | `client/src/features/world-info/components/world-info-settings-section.tsx:28` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `UpdateWorldInfoVars.patch` | `client/src/features/world-info/components/world-info-settings-section.tsx:29` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

4 rows: 0 deleted, 4 derived, 0 kept, 0 handed off, 0 owner questions.

`BookDetailsPatch.name` and `.description` were not dead: `world-info-member-surface.tsx:187` sends the patch whole as `input: patch` to `updateBook`. `BookDetailsPatch` is now `inferInput<Trpc["worldInfo"]["updateBook"]>["input"]`. `UpdateWorldInfoVars.section` and `.patch` follow the `useSetWelcomeGreeter` precedent and take `inferInput<Trpc["settings"]["updateUserSettingsSection"]>`.

Survey: `codegraph_explore` on `BookDetailsPatch book-details-dialog UpdateWorldInfoVars world-info-settings-section`; ast-grep (`-l ts` 5904, `-l tsx` 1522 files) found no other reader of either name. Typecheck exit 0. CT: `platform-world-info-member` mounts the member surface and its details dialog, passed within the 48-test run.
