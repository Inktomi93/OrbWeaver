---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: kit
---

# The content tokenizer overflows the call stack on a reply with a very large number of tag pieces

## What

`expandPieces` in `packages/kit/src/content/index.ts` appends a scanned piece list with one spread call. A reply of several megabytes made of tiny tag runs produces a list long enough for the spread to overflow the stack, and the render throws.

## Why

A large stored reply throws in render instead of drawing or degrading to plain text.

## Done when

The append takes any list length, and a test beside `tests/kit/content/` tokenizes a reply at a piece count that overflowed.

## Evidence

Filled at landing: what ran and where its output is.
