---
paths:
  - "packages/server/src/domain/discovery/**"
  - "packages/contracts/src/discovery/**"
  - "packages/client/src/features/discovery/**"
  - "tests/server/domain/discovery/**"
  - "tests/client/features/discovery/**"
---

# Discovery domain

Read `docs/law/Knowledge-Cluster.md` before you change this domain. It owns the boundary with `embeddings`, `search`, `chat/memory` and `stats`.

- Run analytics cosine in memory with `@orb/kit/vector-math`. `orb/vector-scope-derived-cosine` refuses `vector_distance_cos` outside search's persistence (`docs/law/Knowledge-Cluster.md`).
- Top-k neighbours come only through the injected `similar` op, bound to search at compose (`packages/server/src/domain/discovery/contract/service.ts`).
- Write no vector row. Compute `hub_score` here and write it through the injected `writeHubScores` op; `orb/vector-scope-derived-write` refuses a vector write outside `packages/server/src/domain/embeddings/persistence/`.
- Read no economics column. Usage arrives pre-aggregated through the injected stats op (`packages/server/src/domain/discovery/persistence/message-reads.ts`).
- Every owner analytics read wears `ownedRealCharacters` or `realCharactersOfEveryOwner`, so a synthetic group row never counts as a library card (`packages/server/src/domain/discovery/persistence/character-scope.ts`).
- Owner scope is the resolved Principal, derived through the `characters` join. A pair read scopes both sides (`packages/server/src/domain/discovery/duplicates/retrieve.ts`).
- Take a card's name and face from the `characters` row and its facets from `character_summaries`. Never merge the two reads (`packages/server/src/domain/discovery/persistence/summary-reads.ts`).
- Cluster and compare within one embedding space, over the owner's current generation only (`packages/server/src/domain/discovery/persistence/embed-store-reads.ts`).
- A batch pass contains a per-card failure and counts each skip. The on-demand single-card distill throws, ownership refusal before content refusal (`packages/server/src/domain/discovery/contract/errors.ts`).
- Mint an error class only with its throw site and a surfaced client state. An LLM validation failure degrades to a result that carries `degraded`, and the client shows it, never a silent substitute (`packages/server/src/domain/discovery/index.ts`).
- A card with nothing but its name is not distillable; never invent its facets (`packages/server/src/domain/discovery/verbs/distill.ts`).
- Take every image facet name from `@orb/contracts/embeddings`, never a local list (`packages/server/src/domain/discovery/image-analytics/facets.ts`).
- Every pass announces `corpusRecomputed` once per owner, at its terminal in `packages/server/src/domain/discovery/workload-contributions.ts`.
- Seed k-means from an injected integer seed, never `Math.random` (`packages/server/src/domain/discovery/substrate/kmeans.ts`).
