---
paths:
  - "packages/server/src/domain/embeddings/**"
  - "packages/contracts/src/embeddings/**"
  - "tests/server/domain/embeddings/**"
  - "tests/contracts/embeddings/**"
---

# Embeddings domain

Read `docs/law/Knowledge-Cluster.md` and `Tier-3b-Providers.md` §9 before you change this domain.

- Every vector write lives in `packages/server/src/domain/embeddings/persistence/`. Producers call `store` or `storeSegments`; `orb/vector-scope-derived-write` refuses a vector write anywhere else (`docs/law/Knowledge-Cluster.md`).
- A store upsert never sets or clears `hub_score`; only `writeHubScores` writes it (`packages/server/src/domain/embeddings/persistence/queries.ts`).
- A vector row carries no owner. Ownership derives from its producer, and a trusted read uses the entity owner's encoder, not the acting user's (D20).
- Compare the stored `content_hash` before the embed call; `force` skips only that check (`packages/server/src/domain/embeddings/verbs/store.ts`).
- Stamp the space the provider reports on `EmbedResult.model`, never the caller's model. Derive a space tag only through `embedSpaceOf` (`packages/server/src/domain/embeddings/verbs/store.ts`).
- Refuse a vector whose width is not the pinned generation's with `SpaceMismatchError`; never pad one (`Tier-3b-Providers.md` §9).
- A vector write lands only while its generation is the owner's target. Retire older vectors only after cards, memory and documents report the same generation (`packages/server/src/domain/embeddings/verbs/purge-memory-vectors.ts`).
- A disabled owner gets no memory build and no generation resolve, because a resolve can probe their encoder and purge their vectors (`packages/server/src/domain/embeddings/verbs/vacuous-memory-receipt.ts`).
- An indexer handler re-reads canon by the event's id and never trusts event data. It skips silently when the source is gone (`packages/server/src/domain/embeddings/indexer/handlers.ts`).
- Store first, then prune the rows canon no longer produces. Never clear then store (`packages/server/src/domain/embeddings/verbs/prune-memory-blocks.ts`).
- A caption and its facets come from one structured call. A failed call writes neither, so the next sweep retries the asset (`packages/server/src/domain/embeddings/indexer/caption.ts`).
- A verdict about a model is asked once per composition root, keyed by model id and never persisted. Never spend one call per asset on it (`packages/server/src/domain/embeddings/substrate/avatar-analysis-availability.ts`).
- A missing, corrupt or cut-short image file fails that asset alone; every other error still stops the sweep (`packages/server/src/domain/embeddings/contract/errors.ts`).
- Make every `EmbedFailedError` in `packages/server/src/domain/embeddings/substrate/embed-failure.ts`, which logs it once; a catcher does not log it again.
- A seed vector substitutes only for its matching local-light encoder. The packaged lookup arrives from the composition root (D160, `packages/server/src/domain/embeddings/substrate/seed-embedding.ts`).
- Execution accounting belongs to the invocation, not a vector row. A paid batch survives a later failure (`packages/contracts/src/embeddings/accounting.ts`).
