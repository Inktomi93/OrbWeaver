---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# Chat Context item switches name their book

## What

In the chat Context pane, two list rows with the same entry title produce the same itemSwitchName, so two switches for different entries share one accessible name; the name carries no book qualifier.

## Why

A screen reader user cannot tell which entry a switch toggles.

## Done when

The duplicate-action-door finding is gone from the Chat evidence case of a design-audit run. Already merged: `itemSwitchName` takes the owning list, the regex tier rows and the on-screen roster pass it, and `tests/client/features/chat/components/regex-switches.ct.tsx` covers it. Two same-titled scripts inside one tier still share a switch name; that case is ruled out of this item or given a stable qualifier.

## Evidence

Filled at landing: what ran and where its output is.
