---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# The suppressions waiver budget is over on main

## What

pnpm check:structure --check suppressions on main reports a waiver-budget alarm: the judged count is above the committed budget row in tooling/src/verify/lib/waiver-budget.ts, and two source grants (source-lint-complexity-no-useless-return, source-lint-performance-no-barrel-file) are stale. Deleting the two stale grants (in the 1101/1102 lane) still leaves the count over the budget, so some change on main excused new findings without a matching fix.

## Why

Owner ruling (gate-runtime-standardization.md section 5): excused findings only fall, and a rise means a new finding was excused that must be fixed instead.

## Done when

The commits that raised the count are found with git log on the grant tables and directives; each excused finding is fixed or shown to be an existing excuse moved one for one; the suppressions check passes with the budget row at or below its committed value.

## Evidence

Filled at landing: what ran and where its output is.
