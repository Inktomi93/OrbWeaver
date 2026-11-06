---
kind: bug
status: blocked
updated: 2026-11-06
priority: P3
area: ui
blocked: owner
plan: cross-surface-consistency
---

# The in-list pager shifts a prepend by 63px at 390x844 in document style: name the cause and give the pager one home

## What

Fix the prepend anchor in MessageList and give Earlier messages one home: the transcript's scroll content, in both regimes, as one rendered copy. The member strip keeps its two copies.

## Why

A first row measure runs in its ref callback, mid-commit. The resize veto read the DOM offset through a scroller ref that React had detached, so it read 0 and refused compensation, and the compensating write was dropped the same way. A row that mounted in a follow-up commit then moved the reader by its whole delta: 63px at 390x844 in document style, where rows measure far below their estimate. The pager in the list only moved the window enough for one row to mount late, so the pager rendered twice to avoid a defect in the list.

## Done when

tests/client/features/app-shell/surfaces/platform-history-pager.suite.ct.tsx renders one Earlier messages inside the transcript and measures 0 anchor shift in every chat style at 390x844, in document and flat at 1280x900, and in document at 844x390. The keyboard cases in tests/client/features/app-shell/surfaces/platform-short-room.suite.ct.tsx keep the reader's row while the pager holds focus. Open: the member strip still renders twice, once above the list and once in it, with CSS picking by regime, pending an owner ruling on whether it may scroll away in a tall room.

## Evidence

Filled at landing: what ran and where its output is.
What: find why the virtualizer's prepend anchor misses when the pager sits inside the list in the tall regime. Why: until then the strip and Earlier row render twice, once above the list and once in it, with CSS picking by regime. Done: root cause named and one home for the pager in both regimes.
