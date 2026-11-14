---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: stats
plan: import-robustness
---

# A post-import stats rebuild that live chat starves fails an import that already landed

## What

The rebuild in `packages/server/src/domain/stats/persistence/rebuild-from-canon.ts` yields between pages and folds again whenever the owner's canon version moved under it, up to `STATS_REBUILD_ATTEMPTS` (`packages/contracts/src/stats/index.ts`), then throws. `settleImportRun` in `packages/server/src/domain/import/workload-contributions.ts` awaits that rebuild after every room has landed, so a throw fails the import workload and skips the library refresh.

## Why

An owner who keeps chatting while a large folder import settles can see the run reported failed although every room landed, and the character and chat lists stay stale until a reload.

## Done when

A committed import never fails on rebuild starvation: the settle retries later or reports the rebuild apart from the run's verdict, shown by a test that writes canon during the post-import rebuild until the attempts run out.

## Evidence

Filled at landing: what ran and where its output is.
