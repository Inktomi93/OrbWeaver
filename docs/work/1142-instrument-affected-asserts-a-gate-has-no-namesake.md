---
kind: bug
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# instrument-affected asserts a gate has no namesake spec when one now exists

## What

tests/tooling/verify/ops/instrument-affected.test.ts lines 152 to 155 assert that no spec is named owner-scoped-reads, but d0d0bd8135 added tests/tooling/verify/gates/owner-scoped-reads.test.ts, so the case fails on main.

## Why

A test whose premise the tree no longer holds fails without a defect behind it and hides a real regression in instrument-affected.

## Done when

The case picks a gate whose family test has no namesake, derived from the tree, not a hard-coded id, and passes on main.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
