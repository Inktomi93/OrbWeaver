---
kind: bug
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Native inventory worker scratch directories leak

## What

Dozens of /tmp/orb-native-inventory-worker-\* directories persist after their runs ended, some days old, across worktrees; the supervised-scratch cleanup does not remove them on worker exit or kill.

## Why

Leaked scratch fills /tmp on a small-hardware box and hides which run owns which directory.

## Done when

A worker's scratch directory is removed on normal exit, failure and parent kill, proven by a test that kills a worker mid-run; existing stale directories are swept by the supervisor's own cleanup.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
