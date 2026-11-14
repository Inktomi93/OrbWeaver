---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
plan: authorization-and-visibility
---

# Summary text the model wrote reaches the prompt as literal text

## What

The memory slot and the compaction summary slot are macro-evaluated in `packages/kit/src/macro/registry.ts`. Their text is written by the summarizer from room messages, a member's messages included, and is stored and recalled as written. A member's macro text reaches the summarizer word for word, so a summary that copies it runs on the host's turn. D352 does not cover it: that record keys on a document's owner, and summary text has no owner. It needs a ruling that text the model wrote over room messages reaches a macro-evaluated slot as literal text, with one open point: whether the host's own edit of a compaction summary keeps its macros. It is not reproduced through the composed root.

## Why

A member can aim a macro at the host's variables by getting the model to repeat it in a summary. It is the same class the shared-room flag and D352 closed for other text.

## Done when

A decision record states the ruling and its home. A server case through the composed root shows a summary holding a member's macro reaches the wire as literal text and writes no variable, for the memory slot and the compaction summary slot, with rows stored before the change covered.

## Evidence

Filled at landing: what ran and where its output is.
