---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/user-admin shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/features/user-admin`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AdminCreateUserDialogProps` / `CreateScheduleDialogProps` | `client/src/features/user-admin/components/admin-create-user-dialog.tsx:23` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/workloads/components/create-schedule-dialog.tsx:31`; a shape that matches by coincidence stays |
| `AdminLinkSsoDialogProps` / `AdminResetPasswordDialogProps` | `client/src/features/user-admin/components/admin-link-sso-dialog.tsx:21` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/user-admin/components/admin-reset-password-dialog.tsx:21`; a shape that matches by coincidence stays |
| `AdminLinkSsoDialogProps` / `AdminUserSessionsDialogProps` | `client/src/features/user-admin/components/admin-link-sso-dialog.tsx:21` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/user-admin/components/admin-user-sessions-dialog.tsx:21`; a shape that matches by coincidence stays |
| `AdminResetPasswordDialogProps` / `AdminUserSessionsDialogProps` | `client/src/features/user-admin/components/admin-reset-password-dialog.tsx:21` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/user-admin/components/admin-user-sessions-dialog.tsx:21`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

4 rows: applied 3, kept 1, handed off 0, owner question 0.

- `AdminLinkSsoDialogProps` / `AdminResetPasswordDialogProps` / `AdminUserSessionsDialogProps` (3 rows): merged. The three dialogs are one concept, an admin dialog acting on one account: the same four fields, one feature, and their parents hold the same `{ userId, handle }` target. A new target field changes all three together. The three named props are deleted and the dialogs take `AdminUserDialogProps` (`packages/client/src/features/user-admin/lib/admin-model.ts`). Scan: ast-grep inline rule, `-l ts` and `-l tsx`, `packages tests` (5199 ts and 1450 tsx files): each name had 2 hits, in its own file; rg for the old names returns 0 after the change.
- `AdminCreateUserDialogProps` / `CreateScheduleDialogProps` (1 row): kept. Both are `{ open, onOpenChange, viewerIsOwner }` of a create dialog, but in different features (user-admin, workloads) and for different things; a shared type needs a sideways feature import.
- `pnpm typecheck packages/client/tsconfig.json` exit 0; `pnpm lint:eslint packages/client/src/features/user-admin` exit 0.
- The distinct ledger `tooling/src/unwired/distinct-lookalikes.ts` drops the two merged dialog-props pairs and points the three `onOpenChange` refs at `user-admin/lib/admin-model.ts`; `pnpm test:tools tests/tooling/unwired` exit 0.
