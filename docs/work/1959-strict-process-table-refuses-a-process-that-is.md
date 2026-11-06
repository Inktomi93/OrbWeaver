---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# Strict process table refuses a process that is mid-exit

## What

A process in the middle of exiting breaks both sweep doors. joinRunMarkerSweep fails because the Linux strict reader refuses a same-UID process whose /proc environ is unreadable while its state is still live. The weak door still aborts at run-marker-join.ts on a large process, whose exit takes long enough to be seen between reads.

## Why

A sweep through the strong door can fail on a normal exit race. The weak door already skips this case.

## Done when

A real cascade through either door completes with a large process exiting mid-sweep, and an unreadable process that is not exiting still refuses.

## Evidence

Filled at landing: what ran and where its output is.
