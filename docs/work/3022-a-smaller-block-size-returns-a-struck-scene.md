---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# A smaller block size returns a struck scene to the prompt

## What

A strike matches a summary by its exact endpoints or by a summary whose span contains the strike's span. When the room's grid is re-sliced into smaller blocks (the host lowers the memory block size, or a handoff gives the room a host whose block size is smaller), each smaller block covers only part of the struck span. No summary then matches or contains the strike, the strike moves to the unmatched list, and the smaller blocks that retell the struck turns are admitted into the prompt. A review probe in the recall world struck the storm scene at block size 2, set block size 1, rebuilt memory, and the next turn's prompt carried the storm summary with both of its blocks admitted.

## Why

A host's strike is a promise that the scene stays out of prompts. The fork path now re-keys a strike onto every block its span overlaps; a plain room that re-blocks gets no such re-key, so the same promise breaks there.

## Done when

A summary at the strike's tier whose span overlaps the struck span (not only contains it) is left out, or the room re-keys its strikes when its grid changes; a case lowers the block size after a strike, rebuilds memory, and asserts the struck scene is absent from a forced-turn prompt while an unstruck scene stays, and that restore brings it back.

## Evidence

Filled at landing: what ran and where its output is.
