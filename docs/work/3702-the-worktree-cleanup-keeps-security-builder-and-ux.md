---
kind: tooling
status: open
updated: 2026-11-20
priority: P2
area: tooling
---

# The worktree cleanup keeps security-builder and ux-reviewer reports on main

## What

scripts/worktree-cleanup.sh keeps lane and code-reviewer reports when a worktree is swept, but a security-builder report under reports/security-builder/ was gone after its worktree was removed, so a later re-check could not read the earlier review.

## Why

A follow-up review that cannot read the prior findings re-derives them or misses them.

## Done when

The cleanup keeps every role's report folder that a worktree wrote, and a tooling test sweeps a worktree holding a security-builder report and finds it on main.

## Evidence

Filled at landing: what ran and where its output is.
