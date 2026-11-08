---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: chat
lane: wt/agent-aeb8f21def3afc3d1
plan: cross-surface-consistency
---

# A held pin names the player who left

## What

When a player leaves the room, the room block's held-pin line says the pinned persona is no longer in the room but cannot name that player, because no player data survives the departure. Keep the departed player's display name with the pin, or with the room's membership history, so the line can say whose persona it was.

## Why

When two players share a persona name, a held pin that names no player leaves the host guessing whose pin it is.

## Done when

After a member who shares a persona name with another player leaves, the held-pin line names that player, with a test through the real leave path.

## Evidence

Filled at landing: what ran and where its output is.
