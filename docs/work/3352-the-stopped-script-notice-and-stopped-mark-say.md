---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: chat
---

# The stopped-script notice and Stopped mark say how to fix the script

## What

The notice names the script and says it stays off until reload, but not how to fix it; the roster's Stopped reason is screen-reader only; the sticky notice covers the On screen rows in the context panel.

## Why

A user with a slow script is told it stopped but not where to switch it off or edit it, and the notice hides the row that would let them.

## Done when

The regex stop notice carries an action that opens the stopped script's row, and its overlap with the roster is fixed or ruled; the next-step copy and the visible Stopped reason already exist.

## Evidence

Filled at landing: what ran and where its output is.
