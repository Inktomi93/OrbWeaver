---
kind: tooling
status: open
updated: 2026-10-19
priority: P2
area: tooling
plan: test-foundation
---

# Native placement judges tooling by its contract home

## What

Extend native `orb/type-home-direct-export` to tooling. A tool's result shapes, config schemas and exit data live in its `contract/` (Core-Tooling-Law tool layout). A helper's option or result shape stays beside the function whose signature uses it, by the D324 precedent. Add each tooling home to §7.4 and repair every exported interface or alias outside them.

## Why

981 cannot cover tooling until that ownership is ruled.

## Done when

Native lint judges tooling with the contract home and signature ownership, §7.4 names the enforcer, planted controls refuse a misplaced shape, and no allowance is added.

## Evidence

Filled at landing: what ran and where its output is.
