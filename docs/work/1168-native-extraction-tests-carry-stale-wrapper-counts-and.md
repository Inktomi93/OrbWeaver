---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Native extraction tests carry stale wrapper counts and default timeouts

## What

extractWithoutReferenceWrappers asserts pass.findReferences runs at least once, which stopped holding once computed answers are reused, so about 13 semantic-inventory-extract tests fail; the strict-refs malformed-answer test and the extract Git-admission and alias tests run 20 to 50 s on the 5 s default budget. Both fail on main as well as on the 1045 branch.

## Why

Reds that fail for the instrument's own reasons hide real extraction regressions.

## Done when

The helper counts native-kind answers instead of wrapper calls; each long native test carries a scaled timeout; semantic-inventory-extract and native-strict-references pass on a quiet run.

## Evidence

The combined integration battery retains an inherited invocation replay failure: `getDescendantAtPos` records no cold wrapper calls. It reproduces with original and corrected extractors. Preserve the behavioral claim while replacing stale instrumentation. Evidence: `reports/review/codex-worktree-1179-review.md` and the integration test results archived under `reports/review/salvage/codex-worktrees-2026-10-20/`.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
