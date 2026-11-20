---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: tests
plan: test-foundation
---

# The kit Markdown tests cover the streamed leak and say what the differential catches

## What

A re-review found: the fixed streamed style leak has only a static committed row with a closed style element; the differential test header claims any reverted kit fix turns an axis red, while three of five reverts were caught only by unit rows; and a math block holding a style element makes both strips drop the rest of the reply, prose included, as main also does.

## Why

A missing streamed case and an overclaiming header weaken the guard, and dropping prose loses reply text.

## Done when

A streamed row covers the leak at every prefix, the header states what each test layer catches, and the math-wrapped style case keeps the following prose with a test.

## Evidence

Filled at landing: what ran and where its output is.
