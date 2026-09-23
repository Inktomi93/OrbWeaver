---
kind: adr
status: active
updated: 2026-09-23
---

# The SillyTavern gap register is closed

## Context

Not recorded in the ledger row.

## Decision

The SillyTavern feature inventory is CLOSED — a cold agent never re-audits SillyTavern; re-opening "should we add X from ST" without a `docs/work` item is out of bounds. Dispositions: **imagery** = its own `domain/imagery` leaf (hosted-only `generateImage`; local SD stays rejected; `/imagine` = a Tier-1 automation action). **Gallery** = built (assets read verbs + `gallery_items` per D23-derive). **App background** = an appearance setting (amended by D63; the image trio lives in the `appearance` namespace, only the base surface COLOR is a theme token). **Expressions/sprites** = deferred (design staged; `character_sprites` owner-derived, labels tuple, per-turn hook; sprite-set member visibility per D21). **Databank** = BUILD as a post-chat additive graft: `documents` is a new single-owned canon producer; `document_chunks` a canon-derived vector table (no ownerId — D20); scopes via per-type FK junctions, host-only retrieval mirrors D16. Reaffirmed OUT: text-completion family, tokenizer zoo, local SD, marketplace, TTS/STT, VN scene-compositor.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
