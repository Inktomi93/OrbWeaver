---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# A narrator row's cards may always render plain

## What

A narrator turn is authored by the synthetic group character (`packages/server/src/domain/chat/engine/round.ts`). If the client's participant map holds no seat for it, `resolveRowRenderPolicy` in `packages/client/src/lib/render-trust.ts` falls to its closed default and every card in a narrator row renders inert, with a notice that offers no control. The gap is read from code and not yet confirmed on a captured narrator room.

## Why

Group narration could not show a rich card at all, whatever the room's characters are set to, and no setting would turn it on.

## Done when

A narrator room's roster is captured to confirm or refute the gap. If real, a narrator row's trust resolves from the room's characters by a recorded rule, and a component test covers a narrator card in both tiers.

## Evidence

Filled at landing: what ran and where its output is.
