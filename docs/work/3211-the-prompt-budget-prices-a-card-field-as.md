---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: preset
---

# The prompt budget prices a card field as its macro text

## What

With no chat bound, `barTokens` in `packages/client/src/features/preset/components/readout/prompt-readout.tsx` shows the unknown glyph only for plain markers and estimates every other section from its template text, so a section holding a card or runtime macro such as the description prices at a few tokens, and the totals sum these without saying that card, memory, lorebook and history text are absent. Show the unknown glyph for a section whose text carries a card or runtime macro, and make the totals say what they leave out.

## Why

A small figure under a bar reads as a measurement; the file's own header says a number there is a lie when the real cost is a chat-side fact.

## Done when

A component test renders an unbound readout with a section holding a card macro and finds the unknown glyph, and the totals line names what it leaves out.

## Evidence

Filled at landing: what ran and where its output is.
