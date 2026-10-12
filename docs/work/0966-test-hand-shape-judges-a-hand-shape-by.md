---
kind: work
status: blocked
updated: 2026-10-12
priority: P2
blocked: on 954
plan: test-foundation
---

# test-hand-shape judges a hand shape by its type relation to production

## What

Replace test-hand-shape's field-overlap threshold with the shared shape-relation fact from item 954: a test-side shape that copies, narrows or diverges from a production type its own test can reach is a finding, and a coincidental fit is not. An earlier attempt with its own relation flagged coincidental option shapes and cost several minutes per run; it did not land.

## Why

Owner ruling: judge by type and declaration; a calibrated overlap threshold only approximates the boundary.

## Done when

test-hand-shape calls the floor shape-relation fact; real copies flag; a coincidental fit and an unreachable type pass; the overlap threshold is gone.

## Evidence

Filled at landing: what ran and where its output is.
