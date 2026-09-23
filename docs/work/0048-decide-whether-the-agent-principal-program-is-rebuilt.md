---
kind: decision
status: open
updated: 2026-09-23
priority: P1
area: server
---

# Decide whether the agent-principal program is rebuilt or its design set is deleted

## What

The design set in `docs/architecture/proposed/agent-principal-design/` describes agents as principals: a
mint, participant attribution, a capability ceiling and seats. The tree keeps only the dormant `kind` and
`ownerUserId` columns in `packages/db/src/schema/users.ts`. The mint, the seating path and `canAgent` do
not exist. The owner rules one of two outcomes:

- Rebuild. Refresh the design against the tree and the ADRs, then build it in phases with behavioral tests.
- Delete. Remove the design set, and decide whether the dormant columns stay.

## Why

The set reads as a committed program, but nothing on the tree implements it. The seats in the RPG program
depend on it. Item 0011 cannot place the set until the owner rules.

## Done when

The ruling is recorded. For a rebuild, a plan under `docs/plans/` exists and its build items are filed. For
a deletion, the design set is gone and no doc cites it.

## Evidence

Filled at landing: what ran and where its output is.
