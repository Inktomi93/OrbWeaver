---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The walker's visibility check treats clipped sr-only content as hidden

## What

isVisible in tooling/src/ui-audit/ops/walker/visibility.ts never checks clip or clip-path, so a visually hidden (sr-only) node reads as visible to every walker caller; for example an empty state whose description is clipped still earns excluded(authoredNoAction).

## Why

A rule that counts invisible text as a visible reason passes a dead end the user sees as a bare title.

## Done when

isVisible treats a clip or clip-path that hides the box as not visible, with a fixture of an sr-only description that now fires double-empty-state and a control where a visible description stays excluded, and every caller's population counts compared before and after on one evidence run.

## Evidence

Filled at landing: what ran and where its output is.
