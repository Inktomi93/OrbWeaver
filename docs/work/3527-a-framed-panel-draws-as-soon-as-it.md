---
kind: work
status: blocked
updated: 2026-11-20
priority: P2
area: chat
blocked: on 3605
plan: chat-html-and-presets
---

# A framed panel draws as soon as it is complete while the rest of the reply streams

## What

A reply that will draw in its row's frame shows a forming chip until the whole reply settles, then draws once. Owner ruling: a panel draws as soon as it is complete, while the rest of the reply still streams. Complete means the panel's own element has closed as the kit reader sees it, never the message's done flag. A panel still arriving stays behind the chip, and half-written markup is never drawn.

## Why

A long styled reply shows only a chip for its whole generation. Other chat apps that preview model HTML swap to the preview when the block closes.

## Done when

On the forming row a closed panel draws in its frame while later text streams, with no remount when the reply settles and no second mint for an unchanged panel. An unclosed panel stays behind the chip. The mint count per reply is bounded and stated. Component tests drive the stream through the harness with no timing assertions.

## Evidence

Filled at landing: what ran and where its output is.
