---
kind: adr
status: active
updated: 2026-09-23
---

# The memory system defaults and principles

## Context

Not recorded in the ledger row.

## Decision

The memory system (the code + tests in `domain/chat/memory/` are the spec; this entry is the non-relitigable record): grounded defaults `blockSize 8 · fanOut 4 · verbatimWindow 8 · maxTier 3 · mixC` — tunable, the PRINCIPLE is the invariant. Retrieval is over the BRIDGE (the uncovered-multi-tier set), never flat tier-0. Both forms store `text` (digest distilled body + verbatim segments). `scopedCharacterId` is ALWAYS a real CharacterId (solo's char / the `__group__` synthetic / per-witnessing char) — narrator output mode ≠ the synthetic group character. Two guards, never conflated: the fixed build-protect (`verbatimWindow`) and the token-driven recall window-filter. Build + recall run host-only (`runAsUserId`); members still get the recall via the shared prompt. A fresh chat does ZERO memory/embed work; `memoryTrace` + structured build/recall logs make "did memory work" first-class. The summarizer call is token-guarded against the user's actual context (visible degradation, never silent). Scoped per-character memory + the join/leave WITNESSING predicate (`joinSeq`/`leftSeq`, not `excludedFromPrompt`) + membership-gated cross-chat search are built in full. Mode-switch is recall-handled (scope folds into `content_hash`; recall = shared bucket ∪ speaker's own bucket, witnessing-filtered; keep-each-era's-scope is the default, retroactive rebuild a reserved host action). Clips/Trackers/world-state stay reserved contract seams (`@orb/contracts/memory`).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
