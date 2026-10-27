---
kind: bug
status: doing
updated: 2026-10-27
priority: P2
area: client
lane: main
---

# Give schedule dialogs a visible dismissal action

## What

Add the existing FormDialog visible dismissal affordance to both CreateScheduleDialog and EditScheduleDialog.

## Why

The forms expose Save but no visible Cancel or Close. Escape works, but the shared dialog contract requires a visible exit, including on touch devices.

## Done when

Verify both real schedule dialogs at desktop, phone portrait and short landscape sizes. Dismiss without saving and preserve focus return and schedule values. Reuse the existing dialog API rather than another overlay or policy framework.

## Case decisions

| Behavior | Layer and decision |
| - | - |
| Create and Edit schedule have a visible exit, dismiss without saving and restore focus | Add production contribution CT in `tests/client/features/workloads/components/platform-schedule-dialog-dismissal.suite.ct.tsx`. |
| Schedule persistence and execution | Keep integration owners; no duplicate business-rule matrix in CT. |

These cases address audit regressions, not wholesale legacy restoration. Execution remains pending until native results qualify the stated behavior.

## Evidence

Filled at landing: what ran and where its output is.
