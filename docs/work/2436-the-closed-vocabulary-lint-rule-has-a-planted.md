---
kind: tooling
status: doing
updated: 2026-11-11
priority: P3
area: tooling
lane: wt/agent-a3b00fac426662467
---

# The closed-vocabulary lint rule has a planted test

## What

`tooling/src/eslint/closed-vocabulary.ts` is mounted and type-aware, and no test under `tests/tooling` plants a source for it. The review also proposed a repository test that every mounted rule has a test; D333 removes checker self-policing, so that part is rejected. Source: `reports/codebase-review/units/tooling-eslint.md`.

## Why

A checker-driven rule can over-report or under-report silently without a planted case.

## Done when

A test runs the resolved config over a planted widening projection that the rule refuses and a derived one that it passes.

## Evidence

Filled at landing: what ran and where its output is.
