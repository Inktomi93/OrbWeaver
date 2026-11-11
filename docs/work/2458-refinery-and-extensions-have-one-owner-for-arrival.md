---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: client
lane: wt/agent-ab272ed4fef9cc84a
plan: cross-surface-consistency
---

# Refinery and Extensions have one owner for arrival focus

## What

In Refinery, `packages/client/src/features/refinery/surfaces/refinery-list-surface.tsx` and `refinery-content-surface.tsx` both claim arrival focus, and the content surface wins by effect order. In Extensions, the first arrival from the rail lands in the list pane, but a return from Home lands in the content pane, because `extensions-page-surface.tsx` claims focus again when its Activity is revealed. `tests/client/features/app-shell/surfaces/list-arrival-focus.ct.tsx` records the first-arrival behaviour only.

## Why

Focus that lands in a different pane on the second visit is disorienting for a keyboard or screen-reader user, and an outcome decided by effect order can change without a code change in either file.

## Done when

Each of the two sections has one surface that claims arrival focus, first arrival and return land in the same place, and the arrival test covers the return for both.

## Evidence

Filled at landing: what ran and where its output is.
