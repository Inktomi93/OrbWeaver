---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A reader scrolled up may move when a reply commits below them

## What

In a component test through the real message list, a reader scrolled well above the end moved a short distance when a streamed reply committed below the fold. The move is unverified and may be the hold moving rows on purpose.

## Why

A reader's place in the transcript should not shift when something lands out of view.

## Done when

The move is explained or fixed, and a component test asserts the reading row's screen position across a commit below the fold.

## Evidence

Filled at landing: what ran and where its output is.
