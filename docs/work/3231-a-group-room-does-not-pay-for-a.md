---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A group room does not pay for a summary per character over the same text

## What

Scoped memory sends the same prompt and transcript to each character bucket. Serve every bucket that witnessed the same block from one summary call, or have each bucket's prompt ask for that character's view; record which in the memory decision.

## Why

A room with many characters multiplies summary spend for identical text.

## Done when

A test shows the number of summary calls per block does not grow with the characters who witnessed it, or each bucket's prompt differs by character; the memory decision records the choice.

## Evidence

Filled at landing: what ran and where its output is.
