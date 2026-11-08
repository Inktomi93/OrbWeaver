---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-afb5bff2b14113d1d
plan: cross-surface-consistency
---

# Short-dialog grow and scrollLg lists follow the one-scroller rule

## What

Measure the add-model dialog's model picker and the add-document body at 844x390 and 568x320, and bring them under the one-scroller rule or record why they stay outside it.

## Why

The law sentence names grow and scrollLg lists as outside the rule, and neither was measured in a production dialog.

## Done when

Each is one scroller at both sizes with a CT, or the law sentence states the measured reason it stays.

## Evidence

Filled at landing: what ran and where its output is.
