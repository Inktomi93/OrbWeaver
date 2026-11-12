---
kind: decision
status: open
updated: 2026-11-12
priority: P2
area: security
plan: authorization-and-visibility
---

# D17 states that a delegated admin does not act on the owner's own resources

## What

D17's text says only that an admin cannot grant admin. The rule that a delegated admin does not act on the box owner's own resources lives in a comment in `packages/server/src/domain/admin/guard.ts` and on landed board items, while the workloads headers and the guard cite D17 for it. Its homes are `packages/server/src/domain/admin/verbs/sessions.ts` and `packages/server/src/domain/workloads/substrate/authorize.ts`.

## Why

Code cites a decision for a rule the decision does not state.

## Done when

D17's decision text states the rule and names its homes. For reads it states the owner's ruling: an admin still sees every owner's workloads and schedules, as the workloads owner and funder columns already scope them, and may not act on a row the box owner owns or funds. A row an admin sees and may not act on answers not found, as the bulk clone refusal in the same module already does.

## Evidence

Filled at landing: what ran and where its output is.
