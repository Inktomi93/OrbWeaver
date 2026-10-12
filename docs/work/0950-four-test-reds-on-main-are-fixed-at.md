---
kind: bug
status: doing
updated: 2026-10-12
priority: P1
area: tests
lane: wt/agent-aa8ef587a6aeacb41
plan: test-mirror
---

# Four test reds on main are fixed at their cause

## What

Reproduced on a merged tree by the item 892/906 lane, failing identically at their HEAD versions: `tests/client/data/invalidation.test.ts` (the chatUpdated native-crossfade test), `over-art-plate-arm.int.test.ts` (the dialog-footer differential), `readout-binding.ct.tsx` line 238, and `appearance-carrier-manifest.ct.tsx` line 68. For each, find whether the product or the test drifted, fix the cause, and never loosen an assertion.

## Why

Reds on main poison every lane's evidence for those files and hide new failures.

## Done when

All four pass on main, each with the cause named in the commit.

## Evidence

Filled at landing: what ran and where its output is.
