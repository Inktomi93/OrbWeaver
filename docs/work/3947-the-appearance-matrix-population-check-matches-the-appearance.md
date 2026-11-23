---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
---

# The appearance matrix population check matches the appearance manifest

## What

tooling/src/floor/appearance/appearance-matrix.ts pins EXPECTED_DECLARED_APPEARANCE, EXPECTED_EXECUTABLE_APPEARANCE and EXPECTED_DEPENDENCIES as numbers. The appearance manifest now declares 37 rows (33 executable, 4 dependencies) against the pinned 42, so tests/tooling/snap/ops/matrix-contract.test.ts, tests/tooling/motion-audit/ops/matrix-contract.test.ts and session-matrix.suite.int F10 fail with an instrument population-drift error. The cause, a manifest change without a count update, is inferred, not verified.

## Why

The snap and motion-audit matrix instruments refuse to run while the check is red, and test:tools stays out of CI, so nothing else surfaces it.

## Done when

The check compares the manifest against a value derived from its own registry, or the pinned counts are corrected with the manifest change that moved them identified; the three suites pass; a removed manifest row turns the check red.

## Evidence

Filled at landing: what ran and where its output is.
