---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# The focus grab loop stops only when three refusals land close together, so a loaded browser lets it run longer

## What

The focus gate in `packages/ui/src/content/sandbox-frame/` stops a frame that grabs focus on a loop after three refusals that each fall inside a short window. Under load the refusals can space out past the window, so the loop is not stopped. A component test of the loop failed once under load and passed on repeat runs; the cause is likely and not reproduced.

## Why

The stop depends on timing, so a slow device gives a grabbing frame more turns, and the test of it can fail under load.

## Done when

The cause is reproduced or ruled out. If confirmed, the stop counts refusals without a wall-clock window, or the window is tied to an event the frame cannot stretch, and the component test passes under load.

## Evidence

Filled at landing: what ran and where its output is.
