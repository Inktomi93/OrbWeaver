---
kind: tooling
status: doing
updated: 2026-10-08
priority: P1
area: ci
lane: codex/weekly-tooling-qualification
---

# Separate weekly tooling proof from product qualification

## What

Move exhaustive checker proof to weekly execution and make product qualification independent of tooling-only checks.

## Why

Tooling recertification blocks product publication without establishing application correctness.

## Done when

All nonweekly tiers exclude exhaustive checker proof. Product checks retain application and world invariants. Native controls prove closed product authority, independent weekly results and complete weekly proof collection.

## Evidence

Filled at landing: what ran and where its output is.
