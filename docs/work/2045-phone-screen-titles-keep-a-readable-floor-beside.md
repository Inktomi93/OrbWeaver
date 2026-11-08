---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-ab8f7f48d0abd71fe
plan: cross-surface-consistency
---

# Phone screen titles keep a readable floor beside their actions

## What

Split the shell topbar screen title into name and count, so the count truncates first and the name stays whole at phone widths. Measured at 390 the name fits by one pixel and only the census clips, so the fix touches every section's title.

## Why

A cut title stops naming the screen, and the same shape was fixed for list panes in the rendered review.

## Done when

A CT at 360, 390 and 430 with the longest section name keeps the name whole.

## Evidence

Filled at landing: what ran and where its output is.
