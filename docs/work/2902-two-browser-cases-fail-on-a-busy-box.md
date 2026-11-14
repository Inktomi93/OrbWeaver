---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: tests
---

# Two browser cases fail on a busy box

## What

A review ran two cases several times on main under load and each failed some runs. The motion case for the list door on Chats that expects one event times out in its wait in `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx`. The pagination case where ordinary history reaches its original canon runs out its test budget, once with the Earlier messages control missing.

## Why

A case that fails under load turns a whole check red for no defect, and the whole check runs on a shared box.

## Done when

Each case waits on the state it needs and passes repeated runs under load, or carries the slow tag with a measured budget.

## Evidence

Filled at landing: what ran and where its output is.
