---
kind: bug
status: doing
updated: 2026-10-20
priority: P2
area: security
lane: wt/agent-a7d2c991bb03fc691
---

# owner-scoped writes acquit owner terms that do not scope

## What

owner-scoped-writes and upserts accept an owner term inside or, ne or isNotNull, or a self-comparison, as owner scoping.

## Why

A write whose owner term does not constrain the row to its owner is a cross-tenant write the gate reports as scoped.

## Done when

The owner term is judged on predicate structure: only an eq on the owner column against the caller's owner value in a conjunctive position scopes a write; each acquitting form has a red-first row; live verdicts on main are re-derived.

## Evidence

Filled at landing: what ran and where its output is.
