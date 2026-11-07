---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: chat
---

# Carry a player's correction forward as a standing fact

## What

Let a player save a correction (for example 'I still have the brass key') that every later turn of the chat receives, in the player's own words, until the player removes it. The correction instruction in `packages/client/src/features/chat/components/rewrite-dialog.tsx` applies to one reply only.

## Why

A model that keeps forgetting one fact needs the same correction on every rewrite today.

## Done when

A saved correction appears in the turn prompt of later turns and in the memory view, can be removed, and a test pins add, carry-forward and remove.

## Evidence

Filled at landing: what ran and where its output is.
