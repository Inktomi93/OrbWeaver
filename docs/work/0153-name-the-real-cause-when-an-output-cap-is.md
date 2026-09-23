---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: client
---

# Name the real cause when an output cap is spent on thinking

## What

On agent-sdk a capped turn that spent its whole cap on thinking and wrote no text shows 'The request asked for more output than this model will produce'. The real cause is the output cap being spent on thinking.

## Why

The copy names the wrong cause, so the user raises the wrong setting. No badge for a reply that ran past its cap: the owner removed the length-cap badge on purpose (76806c510).

## Done when

The no-text capped error says the output cap was used up by thinking and points at the cap setting; no new badge or indicator for outputCapReached.

## Evidence

Filled at landing: what ran and where its output is.
