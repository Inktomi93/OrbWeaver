---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# At 844x390 the persona avatar covers a third of the Databank rail button, so a tap on its centre hits the avatar

## What

Stop the persona avatar from covering the Databank rail button at 844x390, so a tap on the button's centre reaches the button.

## Why

At 844x390 the avatar covers a third of the button and a tap on its centre lands on the avatar. The design audit flags it on main and on the short-regime branch.

## Done when

At 844x390 the element at the centre of the Databank rail button is the button, shown by a component test or a snap check, and the design audit no longer flags it.

## Evidence

Filled at landing: what ran and where its output is.

Seen on main and on the short-regime branch; the design audit flags it (`R/1802958`, `R/1799615` in the run slots of `reports/side-eye/2026-11-02-short-regime.md` in worktree `agent-a7ac2f7c6c80f9258`).
