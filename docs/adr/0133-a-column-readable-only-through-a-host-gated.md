---
kind: adr
status: active
updated: 2026-09-23
---

# A column readable ONLY through a HOST-GATED surface does not survive the member→host fork, and the copy is an ALLOW-LIST that `tsc` keeps TOTAL

## Context

Not recorded in the ledger row.

## Decision

A non-host forker becomes HOST of the copy (D110 §3.6), so every plane the source room withheld from them as a member must be dropped at the transition; everything a MEMBER could already read there copies verbatim (the fork grants nothing new). The rule REPLACES per-column judgement: the host-gated variant wire (`loadVariantWire` → `chat.getVariantWire`, `requireHost`) serves `promptSnapshot` + `params` + `macroDraws`, and all three now drop for a non-host forker, as do the contract-declared HOST-PLANE provenance columns `rawContent` + `macroFreezes`. **THE ENFORCEMENT IS THE SHAPE, not the list:** `fork.ts::forkVariantValues`/`forkSlotValues` name every `message_variants` / `messages` column and return `Required<typeof X.$inferInsert>`, so a NEW column is a missing property and fails the build until classified — a deny-list-over-spread defaults a new column to COPIED, which is backwards at a trust boundary and had already let three columns through. The behavioral twin (`fork.int.test.ts`'s per-column census, cross-checked against the live `getTableColumns`) reds on an unclassified column and on a class the verb stops honoring. The same inversion is BUILT in `rpg/chat-ops/fork-game.ts` (five planes, same spread-minus-strips shape — `stripConfigForForker`/`stripFeaturesForForker` + D134's per-field ratchet). Findings record: `docs/history/reviews/security/2026-08-07-fork-host-plane-strip.md`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
