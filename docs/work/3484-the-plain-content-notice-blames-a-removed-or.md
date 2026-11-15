---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# The plain-content notice blames a removed or foreign character and offers a control that cannot fix it

## What

A seat whose character card is gone, a card line after a host handoff and a seat in a disabled host's room get the install's fallback render policy from the server (`packages/server/src/domain/character/contract/room-projections.ts`). The plain-content verdict in `packages/client/src/lib/render-trust.ts` reads that as the character's own setting, so the notice says rich HTML is off for that character and gives the host a Trust tab control for a character the host does not own. The fault is on the card parity branch only.

## Why

The notice exists to name the real cause and the setting that fixes it. Here it names the wrong one and its control leads nowhere.

## Done when

The verdict tells a fallback policy from a character's own setting, names the install or room cause for such a seat, and shows a control only to someone who can change that setting. A unit test over the verdict covers a removed card, a handed-off room and a disabled host's room.

## Evidence

Filled at landing: what ran and where its output is.
