---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: assets
plan: unwired-code
---

# Add the admin rebuild asset index action

## What

AssetsService.rebuildFromTree has no caller. Wire an admin action that rebuilds the asset index from the files on disk.

Ruling: ship it as a workload kind (assets-rebuild-index) with a numbered migration for the workloads kind CHECK, so it gets progress, result feedback and the owner-only maintenance gate like assets-gc and assets-fsck.

## Why

Owner ruling: wanted maintenance action.

## Done when

The admin surface runs the production verb with progress and result feedback; host-only authorization holds; tests cover the verb through the router.

## Evidence

Not landed in the cb-wire lane; it needs a schema change, and migrations are reserved on main. The shape: add `assets-rebuild-index` to `WORKLOAD_KINDS` (`packages/contracts/src/workloads/axes.ts`), a numbered migration that widens the `workloads.kind` and `workload_schedules.kind` CHECK (`packages/db/src/schema/workloads.ts`), a contribution in `packages/server/src/domain/assets/workload-contributions.ts` that calls `rebuildFromTree` with an asset-kind param, and a param control. Maintenance verbs reach admins as workload kinds (`assets-gc`, `assets-fsck` in `packages/server/src/domain/assets/workload-contributions.ts`), which give progress, result feedback and the owner-only maintenance gate. A new kind goes into `WORKLOAD_KINDS`, and `packages/db/src/schema/workloads.ts` mirrors that tuple in a CHECK on `workloads.kind` and `workload_schedules.kind`, so it needs a numbered migration. The verb also takes a `kind` (asset kind) param that no param control offers. The alternative, a one-shot admin mutation, drops the progress the item asks for. Owner call: migration plus workload kind, or a synchronous admin procedure.
