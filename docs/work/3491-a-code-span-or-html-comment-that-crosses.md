---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A code span or HTML comment that crosses a block boundary hides a later style element from the reader

## What

The kit raw-text reader in `packages/kit/src/content/index.ts` reads a code span and an HTML comment as inline units that do not stop at a block or container boundary. A comment opened inside a block quote and closed after it, or a tick run on two lines in different blocks, makes the reader treat a real style element between them as covered, so it is not lifted or stripped and its CSS can print as prose. Fuzzing through the real frame render finds these as the only remaining misses.

## Why

It is the stylesheet-as-prose fault in rare shapes a model or script could still write.

## Done when

Code span and comment reads end at block and container boundaries as Markdown does, and the fuzz that renders through the frame finds no built style element left unlifted or unstripped. A table test covers a comment across a quote boundary and a tick run across two blocks.

## Evidence

Filled at landing: what ran and where its output is.
