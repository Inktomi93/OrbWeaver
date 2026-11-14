---
kind: bug
status: open
updated: 2026-11-14
priority: P3
plan: cross-surface-consistency
---

# A Section kicker word wider than a phone pane at 300% text breaks instead of overflowing

## What

The stacked kicker row in packages/ui/src/layout/section.tsx sizes its heading to the longest word; This chat's disclosure kicker took wrap=anywhere at the call site.

## Why

On main a 9-letter caps kicker fits a 390 px phone at 300% by 3 px, so a narrower phone or longer word pushes the rule past the pane.

## Done when

The kicker heading breaks a word wider than its line at the primitive, a CT at a 320 px phone and 300% text proves it, and the call-site wrap is dropped.

## Evidence

Filled at landing: what ran and where its output is.
