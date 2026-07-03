---
kind: spec
status: active
updated: 2026-07-03
---

# Orbweaver — `databank` domain (Document-RAG)

> **Status: COMMITTED (D49 closes the D47 OPEN call). Promoted from `proposed/databank/`. Phase 7 — post-chat additive graft.**
> Authoritative expansion of D49 item (5). The ledger D-entry wins on any conflict with this doc.
> Source proposal: `proposed/databank/databank.md`.
> **Authoritative build design: [`../proposed/databank-design/README.md`](../proposed/databank-design/README.md) — wins on detail; this file remains the committed decision record.**

---

## 0. The decision in one paragraph

A Data Bank is **books-shaped ownership over a chat_segments-shaped vector substrate.** An uploaded
document is a **new top-level single-owned canon entity** (exactly like `characters`, `assets`,
`world_books`) — it gets `documents.ownerId` + `fetchOwned`. Its chunks are a **canon-DERIVED vector kind**
(exactly like `chat_segments`): a verbatim slice of producer canon + an embedding, FK'd to the producer,
CASCADE, `content_hash` staleness, no `ownerId` (D20). ST's three scopes map onto orbweaver's two
ownership categories via the **world-info junction pattern** (per-type FK junctions, NOT a polymorphic
`(type, id)` table — D24). The graft is ~70% reuse.

**derive-don't-stamp is NOT broken — it is extended by one producer.**

---

## 1. What is genuinely NEW

| Concern                   | Lean on (exists)                                                              | Genuinely NEW                                                                |
| ------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Vector write path         | `embeddings.store` — the ONE inserter                                         | a 5th `store` arm: `kind:'document', lens:'chunk'`                           |
| Source-kind / lens tuples | `SOURCE_KINDS`/`SOURCE_LENSES`/`VECTOR_TABLES` with `satisfies`/`assertNever` | add `'document'` kind, `'chunk'` lens, `'document_chunks'` table — additive  |
| Retrieval engine          | `search` — cosine scan + CSLS + rerank + threshold + reading-order restore    | a `search.documents(scope,…)` verb + a `document` scope branch               |
| Embed role                | `connection.resolveRole('embed')` → 1024-dim Qwen3-VL space                   | nothing — chunks land in the SAME space                                      |
| File bytes (original)     | per-user CAS (`assets` + `infra/storage`, D21)                                | add a `document` `AssetKind`; relax the image-only magic sniff for doc mimes |
| Ownership idioms          | `fetchOwned` + per-type FK junctions (world-info junction pattern)            | `documents` table + 3 scope junctions                                        |
| Injection into prompt     | chat-assembly injection, `{{memory}}` dynamic/cache-safe slot pattern         | a `{{databank}}` reserved macro slot + GATHER branch                         |
| Chunker                   | — (no `kit/chunk` exists)                                                     | **NEW `@orb/kit/chunk`** — pure recursive splitter                           |
| Text extraction           | `infra/storage`, `infra/image` precedent                                      | **NEW `infra/extraction`** — pdf/docx/epub/html→text, db-free                |
| Scrapers                  | `infra/network`                                                               | scraper verbs in the domain                                                  |

---

## 2. Canon tension — RESOLVED

Every current vector row is a pure function of pre-existing canon. An uploaded document has **no
pre-existing producer** — the user creates source-of-truth content by uploading.

**Resolution:** make the document a NEW canon producer, then derive as usual:

```
NEW CANON (source of truth)        DERIVED (pure function of the canon, re-runnable)
────────────────────────────────────────────────────────────────────────────────────
documents            ──extract──▶  documents.extractedText   (binary → text)
(ownerId, fetchOwned) ──chunk────▶  document_chunks.content   (text → slices)
                      ──embed────▶  document_chunks.embedding (chunk → vector, via embeddings.store)
```

`document_chunks` is **exactly a `chat_segments` analogue**: verbatim slice + embedding + producer FK
(`documentId`, CASCADE) + `content_hash` staleness gate + `(model,dim)` space tag + **NO `ownerId`**
(owner derives via `documents.ownerId`, D20).

---

## 3. ST's 3 scopes → orbweaver's 2 ownership categories

ST uses a polymorphic `(type, untyped_id)` — the exact D24-forbidden pattern. orbweaver maps via the
**world-info junction precedent**:

| ST scope      | orbweaver model                        | Mechanism                                                      |
| ------------- | -------------------------------------- | -------------------------------------------------------------- |
| **global**    | single-owned (D21 — NOT a global tier) | `global_documents(ownerId)` junction                           |
| **character** | derive via per-type FK                 | `character_documents(characterId → characters.id, documentId)` |
| **chat**      | membership-scoped                      | `chat_documents(chatId → chats.id, documentId)`                |

Every document is single-owned (`documents.ownerId`). Scope = "where it is retrieved" = per-type FK junctions.

### Multi-human leak — resolved (mirrors D16)

Databank v1: **document retrieval is owner-scoped; in a group chat, only the host's attached documents are
retrieved** (host-scope derived from membership). Solo/single-user unaffected. Membership-gated union widens
for free later, exactly as D16 promises for corpus.

---

## 4. Home in the cake

```
@orb/kit/chunk            NEW — pure recursive splitter (text+params → chunks[]); zero I/O, isomorphic
@orb/contracts/databank   NEW — DocumentView, scope unions, scraper-kind tuple, wire schemas
@orb/db/schema/databank   NEW — documents + 3 scope junctions  (document_chunks lives in schema/embeddings)
infra/extraction          NEW — vendored pdf/docx/epub/html→text loader; db-free; injected extractText op
domain/databank           NEW — the canon producer domain
  └─ extends domain/embeddings  (the 'document'/'chunk' arm — written in embeddings, not databank)
  └─ extends domain/search      (search.documents verb + document scope)
  └─ consumed by domain/chat    (assembly injects {{databank}} at composition root)
```

### 8-slot layout

```
domain/databank/
├── index.ts          FRONT DOOR — DatabankService + factory + view/param/error types
├── service.ts        COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts        DI BUNDLE — { db, assets, embeddingsStore, extractText, fetchUrl,
│                       ensureChatOwned, ensureCharacterOwned, loadOwnedDocument }
├── contract/
│   ├── service.ts    DatabankService interface
│   ├── params.ts     UploadDocumentParams, ScrapeParams, AttachParams (per scope), DocumentId brand
│   ├── results.ts    IngestResult (extracted|chunked|embedded counts), ScrapeResult
│   ├── views.ts      DocumentView, DocumentChunkView
│   └── errors.ts     DocumentNotFoundError, ExtractionFailedError, UnsupportedDocTypeError
├── verbs/
│   ├── upload.ts     upload(bytes,mime,name) → assets.store → extract → chunk → embeddings.store per chunk
│   ├── get.ts list.ts remove.ts   documents CRUD (fetchOwned)
│   ├── reindex.ts    re-chunk + re-embed when params or model change (a workload caller)
│   ├── attach/       attachToChat·detach / attachToCharacter / attachGlobal  (per-type junctions)
│   └── scrape/
│       ├── web.ts youtube.ts wiki.ts   fetchUrl → extract → upload()
│       └── index.ts
├── persistence/
│   ├── queries.ts    toDocumentView · loadOwnedDocument (fetchOwned) · junction CRUD
│   └── scope.ts      resolveActiveDocumentIds(chatId|ownerId) — UNION the 3 junctions (host-only v1)
├── substrate/        (none — chunker is @orb/kit/chunk; extraction is infra/extraction)
└── ingest/           NAMED SUBSYSTEM — upload→extract→chunk→embed orchestration (async/bulk, idempotent)
```

### One-home calls

- **Chunker → `@orb/kit/chunk`** — pure, zero I/O, isomorphic (client preview can reuse). Gate: `kit-purity`.
- **Text extraction → `infra/extraction`** — vendored: pdfjs (pdf), mammoth (docx), epub.js+jszip (epub), Readability/html-to-text (html), passthrough (txt/md). Never imports `@orb/db` or a domain. Gate: `infra-no-db`.
- **`document_chunks` schema → `@orb/db/schema/embeddings.ts`** (NOT `schema/databank.ts`). The embeddings domain owns every vector table; `documents` + 3 junctions → `schema/databank.ts`.
- **`'document'`/`'chunk'` store arm → written in `domain/embeddings`** (the `store` verb, the tuples). databank calls `embeddings.store` via injection; it never inserts a vector row itself (single-write-path invariant).
- **`search.documents` → written in `domain/search`**. databank calls it via injection; no-second-cosine invariant holds.
- **Injection → chat-assembly** (`domain/chat`, Phase 5/whole). databank exposes the retrieval verb; chat's GATHER phase calls it under a `{{databank}}` slot, the dynamic/cache-safe half (parallel to `{{memory}}`).

---

## 5. DB schema

### `documents` — NEW canon producer

```ts
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").$type<DocumentId>().primaryKey(),
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceAssetId: text("source_asset_id")
      .$type<AssetId>()
      .references(() => assets.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    origin: text("origin", { enum: DOC_ORIGINS }).notNull(), // 'upload'|'web'|'youtube'|'wiki'|'text'
    extractedText: text("extracted_text").notNull(), // THE CANON
    importHash: text("import_hash").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("documents_owner_hash_unique").on(t.ownerId, t.importHash)],
);
```

### `document_chunks` — 5th vector table (in `schema/embeddings.ts`)

```ts
export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").$type<DocumentChunkId>().primaryKey(),
    documentId: text("document_id")
      .$type<DocumentId>()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }), // NO ownerId — D20
    chunkIdx: integer("chunk_idx").notNull(),
    content: text("content").notNull(),
    embedding: vector32("embedding", { dimensions: 1024 }).notNull(),
    contentHash: text("content_hash").notNull(),
    hubScore: real("hub_score"),
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("document_chunks_doc_chunk_model_unique").on(t.documentId, t.chunkIdx, t.model),
    index("document_chunks_document_idx").on(t.documentId),
  ],
);
```

### 3 scope junctions (per-type FK — NO polymorphic table — D24)

```ts
// global_documents, character_documents, chat_documents
// Each is a two-column PK junction; mirrors world_books scope-junction pattern exactly
```

### Embeddings tuple extension (additive)

```ts
SOURCE_KINDS += "document";
TEXT_LENSES += "chunk";
VECTOR_TABLES += "document_chunks";
// + DocumentChunkStoreParams discriminated arm in store.ts
```

### Retrieval lens signature (additive — `search/contract/service.ts`)

```ts
documents(params: {
  scope: { chatId: ChatId } | { ownerId: UserId };
  queryText: string; k: number; minScore?: number; rerank?: boolean;
}): Promise<DocumentChunkHit[]>   // sorted by chunkIdx within doc (reading order), then dedup
```

---

## 6. Gates (every invariant ships its enforcer)

1. **No second vector write path** — databank never inserts into `document_chunks`; only via `embeddings.store`. _(dep-cruiser: no `@orb/db/schema/embeddings` write import outside `domain/embeddings`.)_
2. **`vector-scope-derived` (extended)** — `document_chunks` reads only via `search.documents`; owner/host scope applied BEFORE cosine rank. No `ownerId` on `document_chunks` or any junction.
3. **No polymorphic attachment** — 3 typed per-type FK junctions; no `(source_type, source_id)` column. _(schema-shape test.)_
4. **`infra/extraction` is db-free + domain-free** — vendored libs behind an injected op. _(dep-cruiser `infra-no-db`/`infra-no-domain`.)_
5. **The chunker is pure** — `@orb/kit/chunk` has zero I/O / domain deps. _(`kit-purity`.)_
6. **Source-kind/lens exhaustiveness** — adding `'document'`/`'chunk'` without routing the table is a `tsc` error. _(existing `assertNever`/`satisfies` belt.)_
7. **`test-presence`/`test-layout`** — every verb + persistence + contract-schema carries its test.
8. **Document retrieval is owner/host-scoped** — a non-owner's turn never retrieves another user's document. _(int test: a 2nd member's turn returns zero of member-A's chunks.)_

---

## 7. Born-compliant before Phase 5

**Almost nothing.** Databank is a clean additive graft; `document_chunks` lands in the same 1024-dim space
automatically. One optional cheap reservation: the `{{databank}}` macro slot, parallel to `{{world_state}}` —
if the chat macro union is locked during Phase 5, add it as a reserved dynamic/cache-safe slot then (additive,
zero behavior). Otherwise, add it with the feature.

Drop `FLAG[PD-57]` on the embeddings tuples + search scope union so the add-when-built site is discoverable.

---

## 8. Sequencing (depends on Phase 4 substrate + Phase 5 chat)

1. **Prereq:** `embeddings` + `search` + `assets` built (Phase 4)
2. `@orb/kit/chunk` (pure, testable in isolation)
3. `infra/extraction` (vendored loader — the long pole; start dependency vetting early)
4. `@orb/db/schema/databank` + `document_chunks` in `schema/embeddings` + embeddings/search additive arms
5. `domain/databank` (CRUD + ingest subsystem + junctions)
6. Chat-assembly integration (`{{databank}}` GATHER branch) — lands with/after chat (D16)
7. Scrapers (web/youtube/wiki) — fast-follow
8. Client panel (Phase 6)

**v1 scope:** global + chat scopes, owner/host-only retrieval, txt/md/pdf/html.
**Fast-follow:** character scope, docx/epub, youtube/wiki scrapers.

---

## 9. Open questions

1. `extractedText` inline TEXT vs CAS text blob (lean inline for v1)
2. Chunk params: global default vs per-document override (lean a single user-setting)
3. Whole-file-if-small threshold (ST: ≤5 KB embedded whole — keep it)
4. docx/epub vendoring — confirm mammoth + epub.js licenses/bundle size before committing
5. Multi-human widening — when to move from host-only to membership-gated union (free per D16)
6. Re-extract on extractor upgrade — `reindex` workload trigger

---

## 10. Cross-refs

- **D47** — Data Bank is the OPEN call committed to BUILD; gap register §4 (Attachments/Vectors-as-file-RAG)
- **D49** — closes the D47 open call; BUILD as post-chat additive graft
- **D18/D20/D21/D23/D24** — ownership categories, no-polymorphic, no-global-tier
- `domains/embeddings.md` — write path, source-kinds, derive-don't-stamp, content_hash, hub_score
- `domains/search.md` — retrieval engine, lenses, CSLS, rerank, vector-scope-derived gate
- `domains/world-info.md` — the ownership/junction precedent this mirrors exactly
- `domains/assets.md` — per-user CAS, AssetRef, AssetKind
- `domains/chat.md` — Part III (host-only group retrieval, the D16 rule this mirrors)
- `proposed/databank/databank.md` — the full evidence base (ST source audit, neo findings)
