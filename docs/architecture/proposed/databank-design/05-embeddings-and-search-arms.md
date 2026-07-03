---
kind: spec
status: active
updated: 2026-07-03
---

# 05 — The `embeddings.store` 5th Arm and the `search.documents` Lens

> **Status: COMMITTED (D49 item 5) — prescriptive design.** Both arms are written IN THEIR OWNING
> DOMAINS (`domain/embeddings`, `domain/search`), never in databank — databank calls them via
> injection. This doc is the exact additive delta each domain receives, in the vocabulary of
> `domains/embeddings.md` and `domains/search.md`.

---

## 1. The tuple extensions (`embeddings/contract/params.ts` — additive; FLAG[PD-57] marks the site)

```ts
export const SOURCE_KINDS = ["card", "avatar", "chat-block", "document"] as const; // + 'document'
export const SOURCE_LENSES = [
  "card-text",
  "image-raw",
  "image-captioned",
  "segment",
  "digest",
  "chunk", // + the document lens
] as const;
export const VECTOR_TABLES = [
  "character_embeddings",
  "image_embeddings",
  "chat_digests",
  "chat_segments",
  "document_chunks", // + the 5th table
] as const;
```

`satisfies`/`assertNever` belts already gate all three tuples — adding the members without the
routing below is a `tsc` error (gate 6).

---

## 2. The `store` arm

### 2.1 The discriminated params arm

```ts
// embeddings/contract/params.ts
export interface DocumentChunkStoreParams {
  readonly kind: "document";
  readonly lens: "chunk";
  readonly content: string; // the chunk slice (kit/chunk output `content`, incl. overlap prefix)
  readonly model: string;
  readonly dim: number; // (model,dim) space tag — supplied by the caller (getActiveEmbedSpace)
  readonly fkRefs: {
    readonly documentId: DocumentId;
    readonly chunkIdx: number;
    readonly charStart: number;
    readonly charEnd: number;
  };
}
// StoreParams is the discriminated union over kind; DocumentChunkStoreParams is the NEW arm —
// the 4th SOURCE_KINDS member ('card'|'avatar'|'chat-block'|'document') feeding the 5th vector
// TABLE (the "5th arm" phrasing elsewhere counts tables, not kinds — design-review DB-1).
```

The committed one-pager names this arm explicitly; `embeddings.md`'s current prose sketches one
flat `StoreParams` with an optional `fkRefs` bag — the union shape is what actually delivers the
per-kind exhaustiveness both docs demand (README review flag 1). The other four kinds' arms are the
mechanical consequence when the 5th lands. No `ownerId`, no `hubScore` field exists on any arm
(the D20 + never-nulls invariants are compile-time here, as today).

### 2.2 Routing (where `assertNever` forces the work)

`store.ts` owns the lens→table map; `'chunk'` routes to `'document_chunks'`. The dispatch switch's
`default: assertNever(params)` is the exhaustiveness pin — a new `SOURCE_LENSES` member without a
route fails `tsc` AT THE SWITCH, not at runtime.

### 2.3 Upsert + staleness semantics

- **Upsert key:** `(documentId, chunkIdx, model)` — the unique index (doc 02 §2). Idempotent:
  re-storing the same chunk is a conflict-update, never a duplicate row.
- **Staleness gate:** `store` computes `contentHash` over `content`; an existing row with the same
  key and identical hash → `{ outcome: 'noop' }` (no embed call, no write). This is what makes the
  whole ingest re-runnable for free (doc 06 §3): a re-extract that changes nothing costs zero
  provider calls.
- `store` never touches `hub_score` (existing invariant 2 — unchanged, now covering table 5).

### 2.4 The prune seam (NEW verb on `EmbeddingsService` — see README review flag 5)

Reindex can SHRINK a document's chunk count (bigger `chunkSize`, or a re-extract that yields less
text). Upsert alone strands tail rows (`chunkIdx >= newCount`) and rows in a retired `(model,dim)`
space. The delete must live in `embeddings` (the table owner — databank never touches the table),
so:

```ts
// embeddings/contract/params.ts + verbs/prune-document-chunks.ts
export interface PruneDocumentChunksParams {
  readonly documentId: DocumentId;
  readonly keepCount: number; // delete rows with chunkIdx >= keepCount …
  readonly model: string; // … and ALL rows whose model !== model (retired-space cleanup)
}
// EmbeddingsService gains:
pruneDocumentChunks(params: PruneDocumentChunksParams): Promise<{ rowsDeleted: number }>;
```

**Decision: store-then-prune, not clear-then-store.** The ingest upserts every current chunk
(hash-gated no-ops keep it cheap), THEN prunes `chunkIdx >= keepCount OR model != active`. WHY:
preserves the no-op economy — a re-extract with unchanged text re-embeds NOTHING; the prune is one
bounded DELETE. REJECTED: clear-then-restore (trivially correct but re-embeds every chunk on every
reindex — pays the provider for rows that didn't change); REJECTED: databank deleting via `@orb/db`
directly (breaks the single-write-path posture the dep-cruiser rule enforces — the rule covers the
schema import, so the delete MUST live behind an embeddings verb). Mirrors `writeHubScores` as a
narrow, named, non-`store` write seam.

Document DELETE needs none of this — the FK CASCADE removes chunks (a schema-level guarantee, not
a write path).

---

## 3. The `search.documents` lens (written in `domain/search`)

### 3.1 Signature (contract — `search/contract/params.ts` / `results.ts`)

```ts
export interface DocumentSearchParams {
  /** chat turn (host-scoped junction union) | ad-hoc personal search (owner union). */
  scope: { chatId: ChatId } | { ownerId: UserId };
  queryText: string;
  k?: number; // default: the caller passes settings.retrieval.k (5); search's own fallback 5
  minScore?: number; // cosine-similarity floor, default 0.25 (ST score_threshold)
  rerank?: boolean; // default false (§3.5 LEAN)
}

export interface DocumentChunkHit {
  documentId: DocumentId;
  documentName: string; // joined from documents for template rendering + provenance display
  chunkId: DocumentChunkId;
  chunkIdx: number;
  content: string;
  score: number; // the post-pipeline ranking score (cosine or rerank score)
  contentHash: string;
}

// SearchService gains:
documents(params: DocumentSearchParams): Promise<DocumentChunkHit[]>;
```

`UnifiedSearchResult`'s discriminated union gains a `documents` branch; the dispatch switch's
`assertNever` forces the routing (the same §7.5 belt as every other scope).

### 3.2 Scope resolution — the injected resolver (the ONE union home)

```ts
// declared in search/contract/service.ts as an injected dep; PROVIDED by domain/databank
// (persistence/scope.ts) at entry/compose:
export type ResolveActiveDocumentIdsOp = (
  scope: { chatId: ChatId } | { ownerId: UserId },
) => Promise<readonly DocumentId[]>;
```

Semantics (implemented in `databank/persistence/scope.ts` — v1, host-only per the D16 mirror):

- `{ ownerId }` → **every document the owner OWNS** (`documents WHERE ownerId` — no junction
  read). WHY: junctions answer "what feeds THIS chat's prompts"; a personal ad-hoc search is over
  the whole bank — excluding an unattached document from its own owner's search would be a
  surprising hole. REJECTED: a junction union for the owner scope (gates a personal read on
  attachment state that exists only to scope CHAT retrieval).
- `{ chatId }` → resolve the HOST from live membership (`chat_participants role='host'`, D18) →
  `global_documents WHERE ownerId = host` ∪ `chat_documents WHERE chatId` (∪
  `character_documents WHERE characterId ∈ (roster characters)` when the character-scope
  fast-follow lands — the union gains one SELECT, nothing else changes).
- Deduplicated; empty union → `[]`.

**Decision: search receives the resolver by INJECTION; the union SQL has ONE home in databank.**
WHY: the union encodes databank's authority model (host resolution, the v2 membership widening,
the character-scope addition) — knowledge search should not carry; when host-only flips to
membership-gated, ONE file changes and search is untouched. REJECTED: search re-implementing the
union over `@orb/db` (legal as a table read, but a SECOND home for the scope rule — the exact
drift class the one-home law exists to kill); REJECTED: passing `docIds` from databank per call
(pushes scope resolution onto every CALLER of `search.documents`, including chat's GATHER — the
committed signature takes `scope`, so search must own the orchestration). The scope predicate
(`document_id IN (…)`) is applied in SQL **BEFORE cosine rank and BEFORE `content_hash` collapse**
— the `vector-scope-derived` gate, extended (gate 2).

### 3.3 The rank pipeline (normative order)

```
1. allowlist = resolveActiveDocumentIds(scope);  if [] → return []   // ZERO embed calls on an
                                                                     // empty bank (the trigger-
                                                                     // discipline mirror)
2. queryVec  = embed(queryText)  via the injected embed role client  // same space as the chunks
3. SQL: vector_distance_cos over document_chunks
        WHERE document_id IN allowlist AND model = activeModel AND dim = activeDim
        (persistence/scope.ts documents branch supplies the WHERE; persistence/nearest.ts the scan)
4. minScore floor (similarity >= minScore)
5. CSLS hub-adjust — the STANDARD comparator (cslsAdjust + NULL_HUB_FALLBACK)
6. optional cross-encoder rerank (applyRerank, budget-capped) when params.rerank
7. collapseByContentHash — duplicate chunks across re-uploaded/near-copy documents collapse to the
   better-ranked representative (AFTER ranking, BEFORE the k-cap — search invariant 6)
8. k-cap: keep the top k survivors
9. READING-ORDER RESTORE (§3.4): regroup the k hits by document, documents ordered by their
   best-ranked hit, chunks ASCENDING by chunkIdx within each document
10. return DocumentChunkHit[] in that final order
```

### 3.4 Reading-order restore + dedup (the semantics, decided)

The returned list is **grouped by document, documents ordered by best hit, chunks in `chunkIdx`
order within each document** (ST: sort retrieved chunks by original `index`, one-line cite
`vectors/index.js:678`). WHY: the consumer joins these into prompt text — a model reads document
fragments coherently in source order; raw score order interleaves fragments of different documents
into word salad. REJECTED: returning raw rank order and letting each consumer re-sort (two
consumers = the policy drifts; the reading-order property IS the lens's contract, so it lives
here). Dedup is two-layer and both layers are above: exact-duplicate content collapses at step 7
(hash); the same chunk can never appear twice (the scan is over unique rows). The consumer-side
join format (chunks joined `\n`, documents separated `\n\n`) is the CALLER's concern (doc 07 §3 —
it is prompt formatting, not retrieval).

### 3.5 `rerank` — LEAN default OFF

The cross-encoder rerank measurably helps long banks but requires the `rerank` role to be
configured (local-light or hosted). Default `false`; the settings blob exposes it
(`databankSettingsSchema.retrieval.rerank`). Criterion to flip the default: the rerank role ships
in the default local-light tier so a fresh install has it — then parity with the corpus verbs says
default on.

### 3.6 `hub_score` posture for chunks (decided)

- Databank/ingest NEVER writes `hub_score` (only `discovery` may, via `writeHubScores` — the
  existing seam, unchanged).
- v1: `discovery` has NO document-hubness pass → the column is always NULL → step 5's
  `NULL_HUB_FALLBACK (0.5)` makes CSLS a rank-preserving constant shift. **Decision: run the
  standard CSLS step anyway** — one uniform pipeline, zero behavioral difference while NULL, and
  the day discovery adds a document pass, ranking improves with no search change. REJECTED: a
  skip-CSLS special case for documents (a second code path justified only by "it's a no-op" — the
  cross-modal image skip exists for a real math reason, absent here).

### 3.7 Threshold/k defaults

Defaults mirror ST's shipped values (`k=5`, `minScore=0.25` — `vectors/index.js:106` one-line
cite) and live in `databankSettingsSchema` (doc 02 §4) as a user setting; the CALLER (chat's
gather, the panel search box) reads settings and passes explicit values — search's own fallbacks
exist only so the verb is total.

---

## 4. Test plan (the arms' slices)

- **embeddings:** arm round-trip int test (store a chunk → row lands in `document_chunks` with
  correct FK/idx/hash/space tag; re-store same content → `noop`, no embed call — assert via a
  counting fake embed client); prune test (keepCount shrink deletes exactly the tail; model
  mismatch rows deleted; hub_score of survivors untouched); tuple-exhaustiveness is `tsc`.
- **search:** reading-order test (seed 2 docs × 4 chunks with contrived vectors → assert
  group-by-doc + ascending chunkIdx + best-doc-first); minScore floor test; collapse test (two
  identical-hash chunks → one survivor, the better-ranked); empty-allowlist test (NO embed call —
  counting fake); scope leak int test (doc 08 §3 — the two-member zero-cross-retrieval pin);
  injected-resolver contract test (search calls the op with the exact scope it was given).
