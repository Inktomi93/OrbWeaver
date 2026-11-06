---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: chat
---

# Show players what the story remembers and let them strike a memory

## What

Add a plain-language memory view per chat: standing facts and promises, people, places, things and events from out-of-view scenes, saved corrections, and the verbatim recent window. A strike suppresses one remembered item from later prompts; a second strike restores it. In a shared room only the host strikes. Keep the tier, block and match readout of `packages/client/src/features/chat/components/memory-recall-detail.tsx` as a detail toggle.

## Why

The recall readout shows mode, tier, block and match scores, which a player cannot act on. A player who sees a wrong memory has no way to drop it.

## Done when

A player opens the view from the chat, sees remembered items in plain words, strikes one, and the next turn's prompt omits it. Tests pin the strike verb, the restore, and the host-only refusal for a member.

## Evidence

Filled at landing: what ran and where its output is.
