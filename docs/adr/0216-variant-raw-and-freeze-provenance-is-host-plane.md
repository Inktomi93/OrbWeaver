---
kind: adr
status: active
updated: 2026-09-23
---

# Variant raw content and freeze provenance are host-plane

## Context

Split off [ADR 0129](0129-a-canon-row-s-purpose-is-a-declared.md), whose per-row purpose clauses pushed it over the 8 KiB ADR cap.

## Decision

**(F) VARIANT RAW + FREEZE PROVENANCE IS HOST-PLANE.** `message_variants.rawContent` and `macroFreezes` (the ordered `{name, args?, value}` occurrences a commit baked in) are pure provenance: `content` remains the ONE canonical post-transform text every consumer reads (D51). Both are HOST-PLANE and ride the already host-gated variant wire view ONLY, never `MessageView` — the receive transforms exist partly to STRIP content, so serving pre-strip bytes to a member re-opens the D110 §3.6 class. **The storage rule is ONE-DIRECTIONAL** (truth-repaired — this clause first read "NULL ⇔ byte-identical to `content`", which the DB could violate): `rawContent` is stored NON-NULL only when it DIFFERS from `content`, and NULL means "no distinct pre-transform text is served for this row" — nothing transformed the body, OR a later content write invalidated the provenance, OR the fork host-plane strip removed it. The reverse reading is NOT claimed. The provenance describes THIS variant's CURRENT body, so every content write that is not the freeze itself (hand edit, continue, continue undo/revert) CLEARS both columns rather than leaving a record describing bytes that are gone; enforced at the one writer (`domain/chat/persistence/canon-write.ts`). Storage, pass-through, **the freeze-site WRITES at both hops (user send + greeting), and the host-gated READ on `VariantWireView`** are BUILT; the swipe re-resolution the record unlocks is COMMITTED (not yet built — the kit replay engine exists and is pinned, no verb calls it). **(BUILT as FREEZE-AT-SELECTION — `verbs/edit.ts::freezeSelectedVariant`, called from `selectVariant`, is the verb that finally calls the kit replay case (`MacroContext.frozenMacros`, threaded through `assembly/macros.ts::freezeVolatileMacros`). It runs the volatile freeze over `rawContent ?? content` with the stored record replayed positionally, and writes through the ONE writer (`freezeVariantContentStatement`) in the SELECTION's own batch, only when bytes change. That closes the documented greeting-swipe gap — `freezeGreetingVolatiles` bakes only the SELECTED variant at the first user turn, so an alternate swiped to afterwards shipped its literal `{{roll}}` to the model forever — while an already-frozen variant reproduces its own bytes and writes nothing, making A→B→A byte-stable (§13). Gated on a CLOSED greeting window (a user row exists): baking earlier would pre-empt the first-turn freeze and close `setSeededGreeting`'s window (`greeting_frozen`). Host-plane unchanged: the read stays `VariantWireView`, `MessageView` gains nothing.**
**TRUTH-REPAIR, same date:** the persona-rename framing this clause has been read with is FALSE and was never claimed here — identity macros are not in the freeze set (`kit/macro/registry.ts::registerVolatileMacros` registers only random/pick/roll + the clock family; the volatile-only registry re-emits everything else verbatim, pinned by `volatile-freeze-record.suite.int.test.ts` "an IDENTITY macro is not a freeze"), so a persona rename/switch has always reached every stored row through `renderHistoryMacros`. The record's payoff is the VOLATILE half only.)

## Consequences

`rawContent` is stored non-null only when it differs from `content`; NULL means no distinct pre-transform text is served. Every content write that is not the freeze itself clears both columns. `freezeSelectedVariant` bakes the volatile freeze at selection, closing the greeting-swipe gap where an alternate swiped-to variant shipped its literal `{{roll}}` forever.

## Alternatives rejected

Serve `rawContent` on `MessageView` (rejected: the receive transforms exist partly to strip content, so serving pre-strip bytes to a member re-opens the D110 §3.6 class).
