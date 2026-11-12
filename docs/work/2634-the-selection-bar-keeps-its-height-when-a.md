---
kind: bug
status: doing
updated: 2026-11-12
priority: P1
area: ui
lane: wt/agent-a4fe6241d109f14ce
plan: cross-surface-consistency
---

# The selection bar keeps its height when a grown list's floor fills the column

## What

At enlarged text on a phone, in the Regex scripts and Characters libraries, the bulk selection bar is clipped to a thin strip: the selected count and every bulk action are cut off, and in landscape the strip sits over the selected row. The grown VirtualList's floor no longer gives up space, so the bar, a flex item beside it, shrinks far below its content. On a small desktop window at the same text size the bar renders whole. Evidence and run ids: the client merge train review under reports/ux-reviewer.

## Why

Bulk actions cannot be seen or reached at enlarged text on a phone. The list floor is ruled and stays; the bar must not pay for it.

## Done when

The SelectionBar root does not shrink below its content up to its ruled share of the pane. A component test at both phone sizes with enlarged text asserts the bar's height is the smaller of its natural height and its share of the pane, and that the count and every action are visible; red before the fix.

## Evidence

Filled at landing: what ran and where its output is.
