---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: testing
---

# Snap session calls with no route die on the load kill under 24 load

## What

Give snap session calls that carry no route the same time budget as calls that carry one.

## Why

Session calls without a route died on ORB-LOAD-KILL several times when the load was under 24. Their budget is 5 seconds plus the tape, while calls with a route carry 180 seconds.

## Done when

A session call with no route is not killed by the load guard at the load that killed it before, and a test shows the budget of both call kinds is equal.

## Evidence

Filled at landing: what ran and where its output is.

Source: `reports/side-eye/2026-11-01-closeout-4.md` (gitignored, on main's checkout), run on 822d61a82e. Each finding there carries its run ids.
