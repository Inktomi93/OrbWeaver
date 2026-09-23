---
kind: adr
status: active
updated: 2026-09-23
---

# The R4 promotion doorway ships with two named gaps

## Context

Split off [ADR 0121](0121-the-close-out-ruling-for-the-preset-and.md), the close-out ruling for the preset and actor-state programs, whose seven independent clauses (A–G) pushed it over the 8 KiB ADR cap. This clause stands alone, as the original states.

## Decision

**(F) The R4 promotion doorway ships with two NAMED gaps — neither is a defect to re-discover.** `rpg.promoteActor` (`domain/rpg/verbs/promote-actor.ts`) is `dismissActor`'s opposite: it mints a card + roster seat through the injected `promoteToCharacter` op, then re-keys the actor's row, presence, and hand pins from `npc:<slug>` onto `character:<id>` (`substrate/actor-rekey.ts`). **(a) The REWIND ASYMMETRY:** the durable half (card + seat) is not swipe-volatile; the snapshot half is (`writeHandState` writes the variant-keyed head, `snapshot-edit.ts`). A swipe away from the promoting variant therefore rewinds the re-key while the card and seat remain — by construction, since the two halves live on different planes, and the verb's post-mint refusal path already says the card landed rather than reporting a clean no-op. **(b) The PROMOTED-THEN-UNSEATED GAP:** the tracker view projects roster actors from the roster and npcs from `actorState` rows whose `actorRef.kind === "npc"` (`chat-ops/tracker-view.ts`; the case was `"cast"` until renamed it), so a promoted actor whose character later leaves the roster keeps a `character:`-keyed state row that projects nowhere — invisible rather than lost. Closing either is a doorway (re-key-back on unseat / a re-promote case), not a bug fix, and the cross-game `rpg_npcs` library remains the reserved graduation door — its reserved actor-ref case is `{kind:"libraryNpc"}` (with an `RpgLibraryNpcId` brand), renamed off the bare `npc`, which spends that word on the SCENE npc.

## Consequences

`rpg.promoteActor` mints a card and roster seat, then re-keys the actor's row, presence, and hand pins. The rewind asymmetry and the promoted-then-unseated gap are named doorways, not defects to re-discover; closing either is a doorway (a re-key-back on unseat, or a re-promote case), not a bug fix.

## Alternatives rejected

Close the two gaps at mint time instead of naming them as doorways (rejected: the durable and snapshot halves live on different planes by construction, and closing the asymmetry there would require a swipe-time re-key the design does not call for yet).
