---
kind: decision
status: doing
updated: 2026-11-15
priority: P3
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# Decide whether a style element inside a code block needs the frame lift

## What

The framed reply's raw-text lift (`liftRawTextBodies`, beside `packages/ui/src/markdown/frame/frame-markdown.tsx`) leaves an element that opens inside a Markdown code block alone, and an unclosed style inside a code block ends the read, so later style elements in that run are not lifted.

## Why

A reply that shows a CSS sample in a code block and then draws a styled panel could lose the panel's lift.

## Done when

The case is reproduced or shown unreachable. If reachable, the read resumes after the code block and a test covers a sample followed by a styled panel.

## Evidence

Filled at landing: what ran and where its output is.
