---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# The styled hold rescans the whole reply on every streamed chunk

## What

scanStyledHold is linear in the content length but runs from the start on each ghost frame; it does not reuse the scan of the prefix that has not changed.

## Why

Linear holds a 4 MB body under the budget, so this is cost, not a bound.

## Done when

Only if a measured stream shows the scan in the frame budget: a prefix memo, with the linear-time rows still green.

## Evidence

Filled at landing: what ran and where its output is.
