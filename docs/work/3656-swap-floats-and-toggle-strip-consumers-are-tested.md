---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: tests
plan: test-foundation
---

# Swap floats and toggle strip consumers are tested where they can fail

## What

No test holds a float under the shared popup layer that stays open through a section swap; the toggle strip consumer tests do not assert equal cell widths and run only at a 390 pixel phone width.

## Why

A regression in either stays green.

## Done when

A swap case holds an open float across the swap's first frame, and the toggle strip consumer tests assert equal widths at phone and desktop widths.

## Evidence

Filled at landing: what ran and where its output is.
