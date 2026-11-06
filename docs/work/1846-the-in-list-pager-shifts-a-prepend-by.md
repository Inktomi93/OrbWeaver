---
kind: bug
status: doing
updated: 2026-11-06
priority: P3
area: ui
lane: wt/agent-a6a366f81ea905d20
plan: cross-surface-consistency
---

# The in-list pager shifts a prepend by 63px at 390x844 in document style: name the cause and give the pager one home

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
What: find why the virtualizer's prepend anchor misses when the pager sits inside the list in the tall regime. Why: until then the strip and Earlier row render twice, once above the list and once in it, with CSS picking by regime. Done: root cause named and one home for the pager in both regimes.
