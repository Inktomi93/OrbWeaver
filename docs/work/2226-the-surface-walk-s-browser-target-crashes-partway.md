---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: testing
plan: surface-walk
---

# The surface walk's browser target crashes partway through the Home case

## What

A synthetic desktop-1440-all-panes-measurement run of Rail independent home on main crashed its browser target at the list panel partway through, with an incomplete metric binding delivery. A later whole walk lost its group chat room case the same way, and that crash matches the host's early out-of-memory guard to the second: it sent SIGTERM to the walk's browser processes with memory and swap nearly exhausted, and the case passed alone afterwards. The Home sighting has no journal check yet, so the guard is the candidate cause for it too.

## Why

A crashed target ends the walk early, so later doors never run and the case reads cleaner than it is.

## Done when

The Home sighting is checked against the early out-of-memory guard's journal for its date. If the guard explains it, walks and component test runs gate on available memory as well as load, and the walk reports a browser killed by the guard as a void run with its reason, not as a failed case. If a crash reproduces with memory free, its cause is named from the native crash evidence and the case runs to its end on the same project.

## Evidence

Filled at landing: what ran and where its output is.
