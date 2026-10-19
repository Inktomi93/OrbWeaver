---
kind: tooling
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-aeb0038906b746d66
---

# Move detached-work-traced and policy-fixture-substrate off the caught-failure closure

## What

The gate audit rules both MOVE: detached-work-traced becomes a two-to-three-name opener constant in place of its fixpoint reader; policy-fixture-substrate becomes a ban on raw fs write verbs in gate family tests, writing only through scratch helpers. Both currently consume the bounded caught-failure closure that 1098 sizes.

## Why

With them moved and the census gates deleted, caught-failure-ownership is the closure's only consumer, so its cost is one gate's, not five.

## Done when

Each successor lands with its planted controls before its gate is deleted (no gap window), each old gate and its references are deleted, and the closure has one consumer.

## Evidence

Filled at landing: what ran and where its output is.
