---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: testing
plan: surface-walk
---

# The surface walk's browser target crashes partway through the Home case

## What

A synthetic desktop-1440-all-panes-measurement run of Rail independent home on main crashed its browser target at the list panel after about 550 steps, with an incomplete metric binding delivery.

## Why

A crashed target ends the walk early, so later doors never run and the case reads cleaner than it is.

## Done when

The crash is reproduced with the native crash evidence, its cause is named, and the Home case runs to its end on the same project.

## Evidence

Filled at landing: what ran and where its output is.
