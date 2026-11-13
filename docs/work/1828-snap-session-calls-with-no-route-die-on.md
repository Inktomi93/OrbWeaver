---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: testing
---

# Snap session calls with no route die on the load kill under 24 load

## What

A session call with no route died under machine load on the watchdog's base budget in `tooling/src/snap/ops/session-call-watchdog.ts`. The base is the hung-eval detector and `tooling/src/snap/lib/budgets.ts` rules that a base is never widened to be safe, so the two budgets stay different. The phase that overran is not known: only the tape and the scripted steps are counted into the budget. Find which phase of a dead call overran and count it into the budget the way the tape is counted.

## Why

Session calls without a route died on ORB-LOAD-KILL several times when the load was under 24. Their budget is 5 seconds plus the tape, while calls with a route carry 180 seconds.

## Done when

A dead no-route call's log names the phase that overran, that phase is counted into the call's budget, the hung-eval base is unchanged, and a test covers the counted phase and the unchanged hang kill.

## Evidence

Filled at landing: what ran and where its output is.

Source: `reports/side-eye/2026-11-01-closeout-4.md` (gitignored, on main's checkout), run on 822d61a82e. Each finding there carries its run ids.
