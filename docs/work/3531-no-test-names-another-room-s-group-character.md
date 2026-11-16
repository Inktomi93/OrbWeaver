---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: test-foundation
---

# No test names another room's group character, a departed member or a row from before a handoff at the author render read

## What

The author render read in `packages/server/src/domain/chat/verbs/read.ts` decides what a card frame may do. No retained test asks it for another room's synthetic group character, calls it as a departed member, or mints a frame for a narrator row written before a host handoff.

## Why

The read is the card frame's one authority. Its refusals, and that they give no sign a chat exists, are unpinned.

## Done when

Integration tests assert the three cases through the composed server, each failing against a planted break in the gate or the character match.

## Evidence

Filled at landing: what ran and where its output is.
