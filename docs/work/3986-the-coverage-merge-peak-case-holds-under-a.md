---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The coverage merge-peak case holds under a busy box

## What

tests/tooling/unwired/coverage-run.int.test.ts asserts the merge's peak memory exceeds the start sample by a fixed growth, and under a loaded box the start sample is already high, so the case fails; it passed alone twice.

## Why

A memory assertion that depends on box load goes red for reasons unrelated to the change under test.

## Done when

The case measures growth the merge itself causes independent of the start sample's noise, and it passes in a full unwired run beside a parallel lint run twice.

## Evidence

Filled at landing: what ran and where its output is.
