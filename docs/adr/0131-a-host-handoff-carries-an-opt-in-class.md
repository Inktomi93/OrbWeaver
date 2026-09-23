---
kind: adr
status: active
updated: 2026-09-23
---

# A host handoff carries an OPT-IN, CLASS-LEVEL, POINT-IN-TIME property offer. AMENDS \[\[D64]]:

## Context

Not recorded in the ledger row.

## Decision

the seated-character drop stays the default and the decline path, and beside it the departing host may offer COPIES of the characters and the GM preset they brought. Design: commit `09cd25525` §5/§6(f). Homes: `handoffOfferSchema`/`NO_HANDOFF_OFFER` (`@orb/contracts/chat` roster.ts) · `chats.pendingHandoffOffer` · `domain/chat/substrate/handoff-copy.ts` (the plan) · `domain/chat/verbs/participants.ts` (the swap) · `domain/character/contract/handoff-copy.ts` (the minting op) · `entry/boot/migrate-handoff-offer-vocab.ts` (the boot-time key rewrite that keeps a blob written before the current spelling readable — the read seam degrades an unrecognised offer to `NO_HANDOFF_OFFER`, so an un-rewritten row drops a recorded consent silently).

**(A) THE OFFER IS MADE AT NOMINATE AND EXECUTED AT ACCEPT** — acceptance is what freezes the point in time, and nobody receives property they have not accepted. `HandoffOffer {copyCharacters, copyGmPreset}`; **both false, or a null column, is BYTE-IDENTICAL to a handoff with no offer at all** (the built D64 drop runs, the `gmPresetId` and anchor heals run, nothing is copied). It is CLASS-LEVEL, never a per-item matrix (owner: the point is OPTIONS, and a matrix is the jank the ruling's own addendum asked to avoid) — the blob is an OBJECT rather than a boolean precisely so a later per-class case needs no schema churn. Message VARIANTS are deliberately absent from the shape: they are rows keyed to THIS chat and transfer with the room by construction.

**(B) NOTHING IN THE COPY IS A LICENSE.** A seat is a candidate only when its card resolves under the OLD HOST (it is theirs to give) **and does NOT resolve under the NOMINEE** (a card the nominee already owns is a live seat, not a gift — copying it would mint a pointless second library row and orphan the original's history). Every read carries an owner in its WHERE; the roster's `characterId` grants no read (D18/D21/D23). A seat that satisfies neither falls through to the D64 drop, as does one whose card vanished between nominate and accept — the honest degrade, never a blank-name seat. No departing host (they walked) or a self-accept copies nothing.

**(C) THE WRITES GO THROUGH THE OWNING DOMAIN'S FACTORY AS INJECTED OPS,** never a foreign table reach: cards from `character`, books from world-info, the avatar re-own from assets. **BOTH ownership ends are explicit params and both are proven at the op** — an op that re-derived either end is a cross-tenant hole the moment a second call site appears (the injected-op caller gate). `duplicate` cannot serve: it is principal-scoped in both directions and deliberately CLEARS provenance, which here the idempotency in (E) depends on.

**(D) THE ORDERING IS THE CRASH CONTRACT.** True cross-domain atomicity does not exist — the cards, books and preset are separate front-door writes into the nominee's own library — so the LIBRARY half lands FIRST and the room moves in ONE atomic batch afterwards (seat re-point · the canon and BOTH digest re-stamps · book repoint · the D64 drops · the rpg heal). A crash in between leaves the nominee holding ORDINARY LIBRARY ROWS — their own cards and books, editable and deletable, not corruption and nobody's ghost — plus an intact nomination, so the accept is simply re-tried. Minting AFTER the swap was never an option: a crash there leaves a promoted host with a dropped cast and nothing to show for the offer they accepted.

**(E) IDEMPOTENT BY PROVENANCE, NOT BY LUCK.** Every card copy is stamped `importedFrom = handoff:<chatId>:<sourceId>` and the op FINDS BEFORE IT MINTS under that key; books converge on the copy card's junctions or the recipient already owning that book name on this chat, and the preset on its `forkedFrom` lineage. Provenance is the idempotency key, not decoration — it is what makes minting before the swap safe at all.

**(F) AVATARS ARE RE-OWNED, NEVER CARRIED.** `assets` is per-owner with a `(ownerId, hash)` dedup key (D21), so a carried `avatarAssetId` on the nominee's card is BOTH a pointer into a library they cannot read AND a GC root holding the departed host's blob alive through a row they no longer control. Content addressing makes the re-own cheap and idempotent (the same bytes under an owner who already has them resolve to their existing row); a source asset that is gone lands the copy FACELESS rather than not at all.

**(G) PERSONAS ARE NEVER COPIED — the pointer heals instead.** An anchor persona the incoming host cannot read is NULLED in the same swap batch (the honest degrade: otherwise `{{user}}` silently falls through while the knob serves an id they can never inspect). Personas are owner-sacred (D122); this heals a pointer, it never moves a row.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
