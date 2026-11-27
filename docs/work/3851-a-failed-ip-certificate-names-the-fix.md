---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a7af6003da75d8e56
plan: unwired-code
---

# A failed IP certificate names the fix

## What

The certificate card shows failure.message only; validation_failed, issuance_failed and listener_failed are never read.

## Why

Each code names a different fix (the challenge port, the authority, the https port); a message alone does not tell the owner what to change.

## Done when

The card branches on each failure code with its own guidance, covered by a CT, and pnpm unwired codes lists none of them.

## Evidence

Filled at landing: what ran and where its output is.
