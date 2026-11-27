---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a6726678d1a085caf
plan: unwired-code
---

# Operation results a person triggered report their counts

## What

Counts a person's own action produces are shown nowhere: the distill run counts cards whose summary failed (DistillStats.failed was dropped and the closing line in packages/server/src/domain/discovery/workload-contributions.ts names only distilled, scanned and skipped), the avatar backfill's integrity mismatch count (packages/server/src/domain/assets/workload-contributions.ts), and an admin's revoke of a user's sessions, whose count the audit row records and the dialog and share card discard.

## Why

Ruling (delegated): a count that answers a person's own action is collected data, so it is shown; a count only the system uses for bookkeeping stays dead.

## Done when

Each listed operation's result names its count on its surface with a CT, or the item records why that count is bookkeeping.

## Evidence

Filled at landing: what ran and where its output is.
