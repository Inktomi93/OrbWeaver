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

`assets-rebuild-index` is a workload kind, so it has progress, a result line and the owner-only bulk gate that `assets-gc` and `assets-fsck` have.

- **Kind and params:** `WORKLOAD_KINDS` and `WORKLOAD_KIND_MODES` (bulk only, so owner-only) in `packages/contracts/src/workloads/axes.ts`; the params are `{ kind: <asset kind> }` (`assetsRebuildIndexWorkloadParams`).
- **Contribution:** `packages/server/src/domain/assets/workload-contributions.ts` runs `rebuildFromTree`, which now returns the blobs walked and the rows re-derived. The kind excludes `assets-gc` and the imports from running beside it.
- **Migration:** `packages/db/src/migrations/0008_assets-rebuild-index-kind.sql` rebuilds `workloads` and `workload_schedules` with the widened kind CHECK. `tests/db/schema/workload-rebuild-index-kind.repo.int.test.ts` runs it over existing workload and schedule rows, and checks the single-active bulk lock survives.
- **Control:** the run and schedule dialogs show a "What to rebuild" asset-kind picker for the kind (`packages/client/src/features/workloads/components/workload-kind-fields.tsx`). Maintenance kinds now also get their own param control there, so `assets-gc` shows its dry-run switch.
- **Tests:** `tests/server/domain/assets/verbs/rebuild-index.int.test.ts` starts the kind through the workloads router, runs it, and checks the orphan blob gets a row of the chosen kind, a second run changes nothing, a member is refused and a bad asset kind is refused. `tests/client/features/workloads/components/rebuild-asset-index.ct.tsx` schedules the kind through the dialog.
