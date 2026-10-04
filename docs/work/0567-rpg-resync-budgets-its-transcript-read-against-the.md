---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: rpg
---

# RPG resync budgets its transcript read against the connection window

## What

Resync reads a fixed 16384 tokens of story (resync-from-story.ts:65,99) whatever window it sends, so an Ollama room on its 4096 default overflows and the server silently cuts the re-read.

## Why

The deep re-read loses its start without telling the host; found by the R8 verifier on the structured-layer branch.

## Done when

Resync sizes the transcript to the window it sends, or says what it cut, with a test.

## Evidence

Filled at landing: what ran and where its output is.
