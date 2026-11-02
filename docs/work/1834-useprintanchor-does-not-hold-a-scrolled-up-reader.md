---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: ui
plan: css-system
---

# usePrintAnchor does not hold a scrolled-up reader through a real print, and its test reads too early: fix it or delete it

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

Site: `packages/ui/src/primitives/message-list/list-window.ts:55-58`. The reader moves about one row.
