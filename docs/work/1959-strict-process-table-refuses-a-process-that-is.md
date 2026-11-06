---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# Strict process table refuses a process that is mid-exit

## What

joinRunMarkerSweep fails on a real pipeline cascade because the Linux strict reader refuses a same-UID process whose /proc environ is unreadable while its state is still live. A process in the middle of exiting reads that way.

## Why

A sweep through the strong door can fail on a normal exit race. The weak door already skips this case.

## Done when

A real cascade through joinRunMarkerSweep completes, and an unreadable process that is not exiting still refuses.

## Evidence

Filled at landing: what ran and where its output is.
