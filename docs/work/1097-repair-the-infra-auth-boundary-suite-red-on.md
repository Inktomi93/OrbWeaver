---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# Repair the infra auth boundary suite red on main

## What

tests/tooling/verify/ops/security-native-boundaries.test.ts reds on main in two cases. The generated infra verification config now activates many orb rules beyond orb/infra-auth-no-userid and orb/infra-auth-pre-row-imports, which the case says it must not, and the userId identifier-position case exceeds its test budget.

## Why

This suite is the proof for the infra auth boundary, and a red proof hides a real break; the case that asserts no unrelated rules either caught a scope leak from the gate moves or holds a stale expectation, and only reading the generated config says which.

## Done when

The generated infra config's rule set is judged against the law: an unintended activation is scoped out, an intended one is admitted in the expectation with its reason; the identifier-position case runs inside a stated budget; the suite is green on main.

## Evidence

Filled at landing: what ran and where its output is.
