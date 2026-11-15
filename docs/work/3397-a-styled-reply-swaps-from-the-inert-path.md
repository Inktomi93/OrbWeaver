---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# A styled reply swaps from the inert path to its frame without a jump

## What

While a reply streams, and until the mint answers, a styled reply renders through the inert path. The frame starts at the inert render's measured height, then grows to its own. No CT yet proves the transcript's scroll position holds across that swap.

## Why

The coordinator's streaming condition asked for a CT that pins the scroll position across the swap.

## Done when

A CT streams a styled reply on a tierB row, commits it, and asserts the scroll anchor does not move when the frame replaces the inert render.

## Evidence

Filled at landing: what ran and where its output is.
