---
kind: bug
status: doing
updated: 2026-11-15
priority: P2
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# A code block marker line inside a style body turns the frame lift off for later elements

## What

`codeFenceCursor` in `packages/kit/src/content/index.ts` toggles on a code block marker line that is part of a style element's text, so every later element reads as inside a code block and is not lifted.

## Why

The stylesheet prints as prose again for later panels in that reply.

## Done when

Code block state ignores lines a raw-text element covers, and a test shows a later panel still lifted.

## Evidence

Filled at landing: what ran and where its output is.
