---
kind: tooling
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-enforcement
---

# orb-guard refuses a lane's git merge, commit or reset in main's checkout

## What

Make orb-guard refuse a lane's git merge, commit or reset when it runs in main's checkout, and name the form to use instead.

## Why

Only the orchestrator merges to main, and a lane write in the main checkout bypasses that rule. The guard source lives outside this repository (the orb-guard skill rules module). It has a lane-only rule for push and refuses stash, restore, checkout of a path and hook bypass, but no rule on merge, commit or reset by location.

## Done when

A merge, commit and reset run from a lane context in the main checkout are each refused with the right form named. The same commands in the lane own worktree, and the orchestrator in main, still run. The Evidence names where the guard source and its tests are kept.

## Evidence

Filled at landing: what ran and where its output is.
