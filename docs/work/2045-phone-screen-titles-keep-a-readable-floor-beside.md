---
kind: bug
status: doing
updated: 2026-11-07
priority: P3
area: ui
lane: wt/agent-afb5bff2b14113d1d
plan: cross-surface-consistency
---

# Phone screen titles keep a readable floor beside their actions

## What

On a phone a screen title such as Characters truncates when actions share the bar. The shell topbar needs a title floor, with actions folding first. This is the remaining part (c) of item 1825.

## Why

A cut title stops naming the screen, and the same shape was fixed for list panes in the rendered review.

## Done when

At phone widths each section title reads whole or its actions fold first, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
