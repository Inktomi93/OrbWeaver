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

Only the orchestrator merges to main, and a lane's write in main's checkout bypasses that rule.

## Done when

A git merge, commit and reset run from a lane context in main's checkout are each refused with the right form named. The same commands in the lane's own worktree, and the orchestrator in main, still run.

## Evidence

Filled at landing: what ran and where its output is.
