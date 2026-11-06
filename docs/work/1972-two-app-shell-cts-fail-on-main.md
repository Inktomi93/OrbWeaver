---
kind: bug
status: open
updated: 2026-11-06
priority: P1
area: client
plan: cross-surface-consistency
---

# Two app-shell CTs fail on main

## What

app-shell-motion.ct.tsx at line 787 and app-shell-notices.ct.tsx at line 189 fail on every run on main's tip. Find which change broke each and fix the cause.

## Why

A red test on main hides new failures at the barrier, and neither test mounts macro code, so a recent merge broke them.

## Done when

Both tests pass three runs in a row on main, and the report names the cause of each.

## Evidence

Filled at landing: what ran and where its output is.
