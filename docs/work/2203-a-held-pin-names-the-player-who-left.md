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

Visibility ruling: the departed player's handle is shown to every current member of the room, including one who joined after that player left. Handles are already visible to every member through the roster and are what invites use, and the deployment is sized as a roleplay app, so the held-pin line names the player for anyone who can see the pin.
