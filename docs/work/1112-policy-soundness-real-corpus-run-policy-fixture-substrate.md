---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# policy-soundness real-corpus run: policy-fixture-substrate has no native type fact context

## What

tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts fails 'the family reads the REAL gate corpus' on main 27ec80e986: policy-fixture-substrate refuses at visit with 'native type fact context is unavailable'. Every other case in the suite passes.

## Why

The real-corpus liveness case is the proof that the family judges the actual gate tree; a withheld policy there is an unresolved verdict on main.

## Done when

The real-corpus case passes on main with no tool error and nothing withheld, and policy-fixture-substrate receives native type facts in that run, or states why it cannot as a declared limit under D328.

## Evidence

Filled at landing: what ran and where its output is.
