---
kind: bug
status: doing
updated: 2026-11-24
priority: P2
area: tooling
lane: wt/agent-abf90df0f06f44a65
plan: unwired-code
---

# A member named in a typeof type query gets a role

## What

A member named inside a typeof type query on a property path is counted as a key use by the member scan, but the graph census shows it with no role at all.

## Why

A member the type system reads by name can be judged unread.

## Done when

A planted typeof query on a member gives it the role the ruling names, and the census shows no gap for this family.

## Evidence

Filled at landing: what ran and where its output is.
