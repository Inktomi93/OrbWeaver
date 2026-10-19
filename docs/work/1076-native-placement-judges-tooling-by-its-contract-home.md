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

Custom `no-inline-types` already judges tooling aliases and schemas against the tool `contract/` home (Core-Tooling-Law §2.5), and `tooling-slot-template` judges the tool layout. Exported tooling interfaces in `ops/` and `lib/` have no judge. Move tooling placement to native `orb/type-home-direct-export` covering aliases, interfaces and schemas; a helper's option or result shape stays beside the function whose signature uses it, by the D324 precedent. Subtract tooling from the custom population in the same change.

## Why

981 cannot cover tooling until that ownership is ruled.

## Done when

Native lint judges tooling with the contract home and signature ownership, §7.4 names the enforcer, planted controls refuse a misplaced shape, and no allowance is added.

## Evidence

Filled at landing: what ran and where its output is.
