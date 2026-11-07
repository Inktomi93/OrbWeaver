---
kind: bug
status: doing
updated: 2026-11-07
priority: P3
area: ui
lane: wt/agent-a5a6754c31412b587
plan: cross-surface-consistency
---

# P3 bundle from the UI rendered review

## What

Findings F6 to F14 in the UI rendered review report under reports/ux-reviewer. F6 hover-reveal evicts the press transition. F7 face-strip overflow tile sits low. F8 Status card has a ragged start edge. F9 list pane title reads Cha at 1280 with Context docked, against the comment in list-pane-header.tsx. F10 context tab chevron covers the first letter. F11 stock my-4 pl-4 from markdown blockquotes compile to nothing. F12 Corpus line measure and gloss size. F13 one-option Corpus filters read as live. F14 Set character scores stops one level short. Also check whether the Slider neutral fill still has a consumer.

## Why

Each is small, and together they are the places that still look unfinished after the hand-rolling work.

## Done when

Each finding is fixed or ruled with its reason, and the Slider neutral fill is kept for a named consumer or removed.

## Evidence

Filled at landing: what ran and where its output is.
