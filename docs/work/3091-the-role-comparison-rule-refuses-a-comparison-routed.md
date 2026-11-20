---
kind: tooling
status: open
updated: 2026-11-15
priority: P2
area: tooling
plan: typed-enforcers
---

# The role comparison rule refuses a comparison routed through its own helpers

## What

`orb/no-role-comparison` accepts `!userRoleChanged(role, "owner")` and `roleGrantAction(role) === "admin"`, which restate a role equality through the two helpers in `packages/contracts/src/identity/index.ts`. Refuse a literal argument to `userRoleChanged` and a comparison on a `roleGrantAction` result, with rule test rows for both.

## Why

The helpers exist so that a role decision goes through the action table. A comparison spelled through them is the same hand-rolled role check the rule was written to stop, and it lints clean.

## Done when

Both shapes are refused by the rule test, and the tree is at zero with the rule on.

## Evidence

Filled at landing: what ran and where its output is.
