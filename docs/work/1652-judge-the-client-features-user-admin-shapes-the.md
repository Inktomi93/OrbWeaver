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

Filled at landing: what ran and where its output is.
