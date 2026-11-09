---
kind: bug
status: doing
updated: 2026-11-09
priority: P1
area: ui
lane: wt/agent-a5706bbf36b61b0a3
plan: cross-surface-consistency
---

# A confirm dialog fits the phone at 300% text

## What

At 300% text on a phone every confirm dialog is 804px wide, so at 390 portrait the Delete schedule button is off the screen. The alert-dialog action row (packages/ui/src/primitives/alert-dialog/variants.ts) never wraps and nothing caps the popup at the screen width. Found in the merges rendered review.

## Why

A destructive confirm whose primary action is off screen cannot be completed.

## Done when

At 300% text on 390 and 320 phones every confirm dialog fits the screen, its actions wrap or stack and stay reachable, with a CT at 390 and 300% that fails on main.

## Evidence

Filled at landing: what ran and where its output is.
