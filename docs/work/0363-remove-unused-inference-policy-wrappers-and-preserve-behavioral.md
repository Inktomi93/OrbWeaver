---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: inference
---

# Remove unused inference policy wrappers and preserve behavioral proof

## What

Remove evidenceRank and taskProviders if the complete consumer check confirms their test-only status. Keep the live evidence vocabulary, capability synthesis, providerTasks, connectionTasks and funding policy.

## Why

Both helpers have only test callers. Capability synthesis states its precedence directly rather than calling evidenceRank, and the shipped picker does not call taskProviders. Comments and helper tests imply runtime wiring that does not exist.

## Done when

Confirm structural and literal consumers, including barrels and aliases. Preserve provider task eligibility assertions against the live provider policy. Preserve capability precedence and warning assertions against actual synthesis, not an unused index helper. Correct misleading comments and run affected focused suites. Do not change provider offerings or precedence rules.

## Evidence

Filled at landing: what ran and where its output is.
