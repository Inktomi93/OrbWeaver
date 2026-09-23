---
kind: history
status: active
updated: 2026-07-13
---

# Tier-1-DB / Tier-2-Foundation — archaeology record

Frozen 2026-07-13. The port-from-neo narration and superseded-design sagas extracted from
`core/Tier-1-DB.md` + `core/Tier-2-Foundation.md` when those docs were tightened to state current law
only. Nothing here is live law — the current rule lives in the core doc; this is the journey the git
history would otherwise carry. Do not cite from code or from a core doc.

## Tier-1 — `@orb/db`

### The neo-tavern schema-naming lies (motivation for producer-names-the-schema)

The producer-names-the-schema rule exists because neo-tavern named schema files for a CONSUMER, not the
row producer: `search.ts` held the embeddings tables (search reads them; `domain/embeddings` produces
them), `character.ts` held `personas` (persona is its own producer), and `corpus.ts` held discovery's
rollups. Each hid the real owner and let a move silently drift. The live rule + its `db-structure` gate
enforcement are in `Tier-1-DB.md`.

### The `chat_digests.scopedCharacterId` `''`-sentinel supersession (D55)

The pre-build design used an empty-string `''` sentinel for the room/SHARED memory bucket's
`scopedCharacterId`. SUPERSEDED: the shared bucket now keys on a real synthetic group-as-character
`CharacterId` (`__group__${chatId}`), and every digest row carries a real branded `CharacterId` FK →
`characters.id` — never NULL, never a sentinel — so the `(chatId, scopedCharacterId, tier, blockIdx)`
UNIQUE keys off the real id. The current-state authority is `schema/embeddings.ts`'s header; the standing
ruling is D55.

## Tier-2 — `foundation`

### The killed neo-tavern `DEFAULT_*_MODEL_ID` up-edge (canary for foundation-reaches-up-to-nothing)

neo-tavern had foundation reaching UP for `DEFAULT_*_MODEL_ID` constants — the canonical violation of the
floor-reaches-up-to-nothing rule. Those constants live in `@orb/contracts/connection` (a lower package);
foundation dot-imports them DOWN if it needs them. The live rule + its dep-cruiser
`foundation-reaches-up-to-nothing` enforcement are in `Tier-2-Foundation.md`.
