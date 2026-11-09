---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a8da83abc2aef9b16
plan: cross-surface-consistency
---

# A collection band shows its census whole or not at all

## What

At 1280 with both panes docked the Characters band cuts its census to an 8px box that shows the 3 of 326 with no ellipsis, and the phone band at 320 shows a bare separator. A partial number reads as a wrong number.

## Why

The 2230 fix trades an overlap for a misleading digit.

## Done when

When the census does not fit whole it is not shown, its value stays in the accessible name, and a CT across the four collections at 1280 docked and 320 asserts no partial census. Source: acceptance part 4 report A BAND-1.

## Evidence

Filled at landing: what ran and where its output is.
