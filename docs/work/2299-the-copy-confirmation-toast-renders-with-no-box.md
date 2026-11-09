---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: ui
plan: surface-walk
---

# The copy confirmation toast renders with no box at 300% text on the phone

## What

After Copy on a message, the toast region holds the 'Copied to clipboard.' title, but the title has no rendered box at 300% text on the phone. 200% shows it.

## Why

The confirmation that the copy worked is not seen at 300% text.

## Done when

The toast title renders visibly at 300% on chromium-phone-portrait; Chat disposable message operations and every reading style's original canon reading pass the copy step there.

## Evidence

Filled at landing: what ran and where its output is.
