# Orbweaver — `databank` (Data Bank / document-RAG) — PROPOSAL

> **STATUS: PROPOSAL FLAG[PD-57] — the one explicit OPEN architectural call (ledger D47).** This is the evidence base
> for a yes/no on "RAG over the user's own uploaded documents." It is NOT law. Nothing here is committed
> until it graduates to a ledger D-entry and a real `docs/architecture/domains/databank.md`. Do not build
> from this file.
>
> **Why this is the big one:** every other proposed domain leans on an existing seam. This one needs a
> **new canon producer table** (an uploaded document is NOT derivable from canon — it IS canon), a **5th
> embedding source-kind**, a **new search lens/verb**, a **pure chunker**, and a **vendored text-extraction
> loader**. The wrong shape here costs the most, so the canon/ownership mapping below is the load-bearing
> part — read it before the table sketches.
>
> **Provenance:** source-level audit of ST `public/scripts/extensions/{attachments,vectors}/` +
> `public/scripts/{chats,scrapers,utils}.js`, neo-tavern `src/`, and orbweaver
> `packages/{server,db,contracts,kit}/**`. Grounded in the actual `embeddings`/`search`/`assets`/`world-info`
> specs + schema, not guesses.

---

## 1. The decision in one paragraph

A Data Bank is **books-shaped ownership over a chat_segments-shaped vector substrate.** An uploaded
document is a **new top-level single-owned canon entity** (exactly like `characters`, `assets`,
`world_books`) — it gets `documents.ownerId` + `fetchOwned`. Its chunks are a **canon-DERIVED vector kind**
(exactly like `chat_segments`: a verbatim slice of producer canon + an embedding, FK'd to the producer,
CASCADE, `content_hash` staleness, no `ownerId`). So **derive-don't-stamp is not broken — it is extended by
one producer.** ST's three scopes (global / character / chat) map onto orbweaver's two ownership categories
via the **world-info junction pattern** (per-type FK junctions, NOT a polymorphic `(type, id)` table — D24).
The graft into the vector substrate is ~70% reuse: the `embeddings.store` write path, the `search` engine,
the per-user CAS, and the ownership idioms all already exist. The genuinely-new code is bounded: the
`documents` canon table + 3 junctions + a `document_chunks` vector table + a `document` source-kind/`chunk`
lens (additive to `embeddings`) + a `search.documents` verb (additive to `search`) + a pure chunker
(`@orb/kit/chunk`) + a vendored extraction loader (`infra/extraction`) + scraper verbs.

---

## 2. How SillyTavern does it (source-grounded)

ST's Data Bank is **pure client-side state with no DB** — three arrays of metadata, file bytes normalized to
`.txt` on the server filesystem, and a separate Vectors extension that chunks/embeds/retrieves them.

### 2.1 The three scopes (`public/scripts/chats.js`)
`ATTACHMENT_SOURCE` (`chats.js:77`): `{ GLOBAL:'global', CHARACTER:'character', CHAT:'chat' }`. Each scope is
a **different persisted bucket** (`getDataBankAttachments` `chats.js:1779`, upload switch `chats.js:1732`):

| ST scope | Storage | Persistence |
|---|---|---|
| **global** | `extension_settings.attachments` (array) | `settings.json` |
| **chat** | `chat_metadata.attachments` (array) | per-chat metadata |
| **character** | `extension_settings.character_attachments[<avatar>]` (keyed by avatar filename) | `settings.json` |

`getDataBankAttachments(includeDisabled)` **merges all three** and filters disabled (`disabled_attachments`
by URL). Character attachments are GC'd on character delete/rename (`extensions/attachments/index.js:223`
`cleanUpCharacterAttachments`).

### 2.2 The attachment object + upload pipeline
Shape (`chats.js:62` `@typedef FileAttachment`, literal at `:1723`): `{ url, size, name, created, text? }`.
`url` is a server path; `text` is a transient cache (stripped from global/character on startup,
`index.js:200`). Upload (`uploadFileAttachmentToServer` `chats.js:1691`): **extract → base64 of the EXTRACTED
TEXT → `POST /api/files/upload` → store path as `url`.** The original binary is discarded — everything is
normalized to a `.txt`. Retrieval is a plain `GET url` (`getFileAttachment` `chats.js:303`).

### 2.3 Text extraction (mostly CLIENT-side — a key finding)
ST extracts in the **browser** (`public/scripts/utils.js`), not the server:

| Format | Function | Lib |
|---|---|---|
| PDF | `extractTextFromPDF` (`utils.js:2029`) | **pdf.js** (`lib/pdf.min.mjs`) |
| HTML | `extractTextFromHTML` (`utils.js:2052`) | DOMPurify + **Readability.js** |
| Markdown | `extractTextFromMarkdown` (`utils.js:2064`) | passthrough (`blob.text()`) |
| EPUB | `extractTextFromEpub` (`utils.js:2070`) | **epub.js + jszip** |
| Office (docx/xlsx/pptx) | `extractTextFromOffice` (`utils.js:2102`) | **server plugin** `POST /api/plugins/office/parse` (optional, not core) |

Only Office goes server-side, and only via an optional plugin. **Orbweaver will do extraction server-side**
(the client is sealed/thin; D-cake `client` has no backend runtime) — so this is net-new infra work, not a
port.

### 2.4 Chunk + embed + retrieve (`extensions/vectors/index.js`)
The Data Bank has its OWN settings block, chunk size, and injection tag, distinct from chat-message
vectorization:

- **Settings** (`index.js:106`): `size_threshold_db:5` (KB — files ≤ this are NOT chunked, embedded whole),
  `chunk_size_db:2500` (chars), `chunk_count_db:5` (topK/collection), `overlap_percent_db:0`,
  `file_template_db:'Related information:\n{{text}}'`, `file_position_db:IN_PROMPT`, `file_depth_db:4`,
  `file_depth_role_db:SYSTEM`. Global `score_threshold:0.25`.
- **Chunker** (`vectorizeFile` `:727` → `splitRecursive` `utils.js:1156`): recursive split on delimiter
  hierarchy `['\n\n','\n',' ','']`, then greedy re-merge up to `length`; `length<=0` ⇒ whole file
  (`utils.js:1158`). Overlap via `overlapChunks` (`:740`). Each chunk → `{hash, text, index}`.
- **Collection id** (`getFileCollectionId` `:199`): `` `file_${hash(fileUrl)}` `` — **one vector collection
  per file**, app-wide shared (same file in two scopes reuses one collection). (Chat-message vectorization
  by contrast keys the collection on `chatId`.)
- **Retrieve + inject** (`rearrangeChat` `:776` → `processFiles` `:576` → `injectDataBankChunks` `:678`):
  `ingestDataBankAttachments` (idempotent — skips files whose collection already has hashes),
  `getQueryText(chat,'file')` builds the query from the last 2 messages, `queryMultipleCollections` topK per
  collection over `score_threshold`, **sort chunks by original `index` (restore reading order)**, de-dup,
  join with `\n`, collections separated by `\n\n`, wrap in `file_template_db`, inject via
  `setExtensionPrompt('4_vectors_data_bank', …, depth 4, SYSTEM)`. Never mutates the chat array (unlike
  chat-message vectorization, which relocates actual messages).

### 2.5 Scrapers (`public/scripts/scrapers.js:574` `initScrapers`)
Six scrapers, each `scrape()` returns `File[]` that feed the same upload path: **file** (local picker),
**text** (Notepad), **web** (`POST /api/search/visit` → one `.html`/URL), **mediawiki**
(`/api/plugins/fandom/scrape-mediawiki`), **fandom** (`/api/plugins/fandom/scrape`), **youtube**
(`POST /api/search/transcript`). Mediawiki/fandom are a server plugin, not core.

---

## 3. What neo kept / cut

**neo CUT the Data Bank / document-RAG entirely** (verified: `dataBank` = 0 hits, no scrapers, no
pdf/docx/epub extraction, no per-file upload-for-RAG in `neo-tavern/src`). The `attachment` hits are a
DIFFERENT concept — **world-book attachments** (`_shared/world-book-attachments/`), i.e. which lorebooks
attach to a persona/character/chat. neo kept the **vector machinery** but pointed it only at its own canon
entities — chat messages (memory/corpus), character cards (search), images — with born-compliant FK'd
schema. **Document-RAG is therefore net-new to the orbweaver lineage; ST is the only reference impl**, and
its design tells (extraction is browser-side, storage normalizes to `.txt`, one vector collection per file)
are the things orbweaver deliberately does differently.

---

## 4. orbweaver substrate to lean on vs what is genuinely NEW

| Concern | Lean on (exists) | Genuinely NEW |
|---|---|---|
| Vector write path | **`embeddings.store`** — the ONE inserter (`embeddings.md`); hash-gated upsert, never nulls `hub_score`, stamps `(model,dim)` | a 5th `store` arm: `kind:'document', lens:'chunk'` |
| Source-kind / lens tuples | `SOURCE_KINDS` / `SOURCE_LENSES` / `VECTOR_TABLES` (`embeddings/contract/params.ts`) with `satisfies`/`assertNever` belts | add `'document'` kind, `'chunk'` lens, `'document_chunks'` table — **additive** (same pattern as the FLAG[PD-34] `chat-block` add-when-built) |
| Retrieval engine | **`search`** — cosine scan + CSLS + rerank + threshold + reading-order restore (`search.md`) | a `search.documents(scope,…)` verb + a `document` scope branch |
| Embed role | `connection.resolveRole('embed')` → `infra/providers/roles/embed.ts` sealed impl; the 1024-dim Qwen3-VL space | nothing — chunks land in the SAME space (text-comparable) |
| File bytes (original) | **per-user CAS** (`assets` + `infra/storage`, D21); within-user dedup, owner-gated `/blob` | add a `document` `AssetKind`; relax the image-only magic sniff for doc mimes |
| Ownership idioms | `fetchOwned` + per-type FK junctions (the `world_books` + 4 scope-junction pattern, `world-info.md`) | `documents` table + 3 scope junctions |
| Injection into prompt | chat-assembly injection (`@orb/kit/injection` `{depth,role}`), the `{{memory}}` dynamic/cache-safe slot pattern | a `{{databank}}` reserved macro slot + the chat-assembly GATHER branch |
| Chunker | — (no `kit/chunk` exists) | **NEW `@orb/kit/chunk`** — pure recursive splitter (mirrors `kit/macro`, `kit/world-info` keyword matcher) |
| Text extraction | `infra/storage`, `infra/image` precedent (db-free vendored-lib loaders) | **NEW `infra/extraction`** — pdf/docx/epub/html→text, db-free, injected `extractText` op |
| Scrapers | `infra/network` (exists) | scraper verbs in the domain (fetch via infra/network → extract → create document) |

---

## 5. THE CANON TENSION, RESOLVED

### 5.1 Why a document is not like the existing four vector kinds
Every current vector row is a **pure function of pre-existing canon**: `character_embeddings` ⟸ a
`characters` row; `image_embeddings` ⟸ an `assets` row; `chat_digests`/`chat_segments` ⟸ a `chats` row's
messages. Delete the producer → CASCADE drops the vector; change the producer's content → `content_hash`
forces a re-embed. The substrate is **never a second source of truth** (`knowledge-cluster.md` §0). That is
why none of these tables carry `ownerId` (D20) — the owner is reachable by one FK to an already-owned
producer.

An uploaded document has **no pre-existing producer.** The user creates source-of-truth content by
uploading. There is nothing to FK to whose existence/ownership the document derives from. **The document IS
canon.**

### 5.2 The resolution: add ONE producer, then derive as usual
The tension dissolves the moment you stop trying to make the document a *derived* row and instead make it a
*new canon producer*, structurally identical to `characters`/`assets`/`world_books`:

```
NEW CANON (source of truth)        DERIVED (pure function of the canon, re-runnable)
─────────────────────────────────────────────────────────────────────────────────────
documents            ──extract──▶  documents.extractedText   (binary → text)
(ownerId, fetchOwned) ──chunk────▶  document_chunks.content   (text → slices)
                      ──embed────▶  document_chunks.embedding (chunk → vector, via embeddings.store)
```

`document_chunks` is then **exactly a `chat_segments` analogue**: a verbatim slice of producer canon + an
embedding, FK'd to the producer (`documentId`, CASCADE), `content_hash` staleness gate, `(model,dim)` space
tag, **NO `ownerId`** (owner derives via `documents.ownerId`, D20). Re-chunking (param change) or re-embedding
(model change) regenerates it from the canon — the substrate stays a pure function. **derive-don't-stamp is
upheld; we added one producer, not a parallel ownership model.**

Three derive layers, each independently re-runnable (binary→text→chunks→vectors), is the same shape as
`assets` (bytes) → `image_embeddings` (derived) and `chats` (messages) → `chat_segments` (derived). The only
novelty is that the canon *originates from an upload* rather than from another feature's CRUD — which is a
property of `assets` too (an avatar is uploaded canon). So the precedent literally exists.

### 5.3 ST's 3 scopes → orbweaver's 2 ownership categories (NO polymorphic table — D24)
ST attaches one document to `{global|character|chat}` via a `source` discriminator + id — the **exact
polymorphic `(type, untyped_id)` pattern D24 forbids.** orbweaver maps it onto the **world-info junction
precedent**, which already solved this for lorebooks (`world_books` single-owned + 4 per-type FK scope
junctions):

| ST scope | orbweaver model | Mechanism |
|---|---|---|
| **global** | single-owned (D21 — NOT a global tier) | `global_documents(ownerId)` junction = "auto-active in all my chats" |
| **character** | derive via per-type FK | `character_documents(characterId → characters.id, documentId)` = active when that character is in the chat |
| **chat** | membership-scoped (derive via chat) | `chat_documents(chatId → chats.id, documentId)` = active in that specific chat |

**Every document is single-owned** (`documents.ownerId` + `fetchOwned`) — the *scope* is purely "where it is
retrieved," expressed as **per-type FK junctions** (3 typed tables, CASCADE, no `(type,id)` soft ref). The
retrieval scope is **derived at query time by unioning the applicable junction rows** — identical to how
`chat/assembly/world-info/pool.ts` unions the 4 book-scope junctions. This satisfies D24 (per-type FK), D21
(no global tier), D23 (junction rows derive their owner via the document FK → no `ownerId` stamp on
junctions or chunks).

### 5.4 The multi-human leak — resolved by mirroring the D16 corpus call
`documents` is single-owned, but a `chat_documents` junction attaches an owner's document to a *shared*
chat. If user B's turn in a group chat retrieved user A's attached document, A's private doc text leaks into
B's prompt. The constitution already decided the analogous case: **D16 — "member room/group corpus search is
host-only in v1"** (the host-only scope is *derived* from membership, `chatId ∈ {chats the user hosts}`, not
a stamped digest). Databank v1 adopts the identical rule: **document retrieval is owner-scoped; in a group
chat, only the host's attached documents are retrieved** (host-scope derived from membership). Solo/single-user
(the dominant case) is unaffected. A membership-gated union (every member's docs) widens for free later,
exactly as D16 promises for corpus. This is the `vector-scope-derived` gate applied to the new lens.

---

## 6. Proposed home in the cake

A new leaf domain **`domain/databank`** (after the leaf-first server domains; depends on `embeddings`,
`search`, `assets`; integrates with `chat` assembly — so it lands **after chat is built whole**, Phase
6/7). Name matches ST vocabulary + the proposed folder.

### 6.1 Tier placement (the cake)
```
@orb/kit/chunk            NEW — pure recursive splitter (text+params → chunks[]); zero I/O, isomorphic
@orb/contracts/databank   NEW — DocumentView, scope unions, scraper-kind tuple, wire schemas
@orb/db/schema/databank   NEW — documents + 3 scope junctions  (document_chunks lives in schema/embeddings)
infra/extraction          NEW — vendored pdf/docx/epub/html→text loader; db-free; injected extractText op
domain/databank           NEW — the canon producer domain: documents CRUD + ingest pipeline + scrapers
  └─ extends domain/embeddings  (the 'document'/'chunk' arm — written in embeddings, not databank)
  └─ extends domain/search      (search.documents verb + document scope)
  └─ consumed by domain/chat    (assembly injects {{databank}} at composition root)
```

### 6.2 The 8-slot layout (`domain/databank`)
```
domain/databank/
├── index.ts            FRONT DOOR — DatabankService + factory + view/param/error types
├── service.ts          COMPOSITION ROOT — wires verbs + injected deps (embeddings.store, search.documents,
│                         assets.store, extractText, chunk, fetchUrl). ZERO logic.
├── context.ts          DI BUNDLE — explicit interface DatabankContext (db, assets, embeddingsStore,
│                         extractText, fetchUrl, ensureChatOwned, ensureCharacterOwned, loadOwnedDocument)
├── contract/
│   ├── service.ts      DatabankService interface (the authoritative API)
│   ├── params.ts       UploadDocumentParams, ScrapeParams, AttachParams (per scope), DocumentId brand
│   ├── results.ts      IngestResult (extracted|chunked|embedded counts), ScrapeResult
│   ├── views.ts        DocumentView, DocumentChunkView (derives @orb/contracts/databank)
│   └── errors.ts       DocumentNotFoundError, ExtractionFailedError, UnsupportedDocTypeError
├── verbs/
│   ├── upload.ts       upload(bytes,mime,name) → assets.store(kind:'document') → extract → chunk →
│   │                     embeddings.store(kind:'document',lens:'chunk') per chunk  (the ingest pipeline)
│   ├── get.ts list.ts remove.ts          documents CRUD (fetchOwned)
│   ├── reindex.ts      re-chunk + re-embed when chunk params or embed model change (a workload caller)
│   ├── attach/         attachToChat·detachFromChat / attachToCharacter·… / attachGlobal·…  (per-type junctions)
│   └── scrape/
│       ├── web.ts youtube.ts wiki.ts     fetchUrl (infra/network) → extract → upload()  (one verb/scraper)
│       └── index.ts
├── persistence/
│   ├── queries.ts      toDocumentView · loadOwnedDocument (fetchOwned) · junction CRUD
│   └── scope.ts        resolveActiveDocumentIds(chatId|ownerId) — UNION the 3 junctions (host-only v1)
├── substrate/
│   └── (none — the chunker is @orb/kit/chunk; extraction is infra/extraction)
└── ingest/             NAMED SUBSYSTEM — the upload→extract→chunk→embed orchestration (the async/bulk path,
                          coalesceable; mirrors embeddings/indexer/). Idempotent via content_hash.
```

### 6.3 Where each NEW concept lives (one home)
- **The chunker → `@orb/kit/chunk`.** Pure (`splitRecursive`-equivalent: delimiter hierarchy + greedy
  re-merge + overlap), zero I/O, isomorphic (client preview can reuse it). Same class as `kit/macro`,
  `kit/regex`, `kit/world-info`. Gate: `kit-purity`.
- **Text extraction → `infra/extraction`** (NEW infra adapter, db-free; mirrors `infra/storage`,
  `infra/image`). Vendored libs: pdfjs (pdf), mammoth (docx — ST punts to a plugin; orbweaver vendors it),
  epub.js+jszip (epub), Readability/html-to-text (html), passthrough (txt/md). Exposes `extractText(bytes,
  mime) → string`; the domain injects it. **Never imports `@orb/db` or a domain.** Gate: `infra-no-db`.
- **`document_chunks` schema → `@orb/db/schema/embeddings.ts`** (NOT `schema/databank.ts`). The producer of
  a vector row names its schema file (`embeddings.md` rule); `embeddings` owns every vector table. The
  `documents` canon + the 3 junctions → `@orb/db/schema/databank.ts` (the databank domain is their
  producer).
- **The `'document'`/`'chunk'` store arm → written in `domain/embeddings`** (the `store` verb, the
  `SOURCE_KINDS`/`SOURCE_LENSES`/`VECTOR_TABLES` tuples). databank *calls* `embeddings.store` via injection;
  it never inserts a vector row itself (the single-write-path invariant).
- **`search.documents` → written in `domain/search`** (a new verb + a `document` scope branch in
  `persistence/scope.ts`). databank *calls* `search.documents` via injection; the no-second-cosine
  invariant holds.
- **Injection → chat-assembly** (`domain/chat`, Phase 5/whole). databank exposes the retrieval verb; chat's
  GATHER phase calls it and injects the result at a configured `{depth,role}` under a `{{databank}}` slot,
  the dynamic/cache-safe half (parallel to `{{memory}}`).

### 6.4 Client surface (Phase 6+)
A `@orb/ui` Data Bank panel: per-scope document list, drag-drop upload, scraper inputs (URL/youtube/wiki),
per-document enable/disable, per-chat/character attach toggles. Wire types from `@orb/contracts/databank`.
The chunker (`@orb/kit/chunk`) is importable client-side for a chunk-count preview. Out of scope for the
decision; listed for completeness.

### 6.5 Gates (every invariant ships its enforcer)
1. **No second vector write path** — databank never inserts into `document_chunks`; only via
   `embeddings.store`. *(dep-cruiser: no `@orb/db/schema/embeddings` write import outside `domain/embeddings`
   — the existing embeddings invariant 1 extends to cover the 5th table.)*
2. **`vector-scope-derived` (extended)** — `document_chunks` reads only via `search.documents`; the
   owner/host scope (derived from the junctions, host-only v1) is applied BEFORE cosine rank and BEFORE
   `content_hash` collapse. No `ownerId` on `document_chunks` or any junction. *(the existing gate, widened to
   the 5th table.)*
3. **No polymorphic attachment** — 3 typed per-type FK junctions; schema has no `(source_type, source_id)`
   column. *(schema-shape test, like world-info invariant 1.)*
4. **`infra/extraction` is db-free + domain-free** — vendored libs behind an injected op. *(dep-cruiser
   `infra-no-db`/`infra-no-domain`.)*
5. **The chunker is pure** — `@orb/kit/chunk` has zero I/O / domain deps. *(`kit-purity`.)*
6. **Source-kind/lens exhaustiveness** — adding `'document'`/`'chunk'` without routing the table is a `tsc`
   error. *(the existing `assertNever`/`satisfies` belt in `store.ts` — already enforced.)*
7. **`test-presence`/`test-layout`** — every verb + persistence + contract-schema carries its test.
8. **Document retrieval is owner/host-scoped (no cross-user leak)** — a non-owner's turn never retrieves
   another user's document; a group turn retrieves only the host's. *(int test: a 2nd member's turn returns
   zero of member-A's chunks — mirrors the D16 corpus host-only test.)*

---

## 7. Contract + DB schema sketches (concrete)

### 7.1 `documents` — NEW canon producer (`@orb/db/schema/databank.ts`), single-owned
```ts
export const documents = sqliteTable("documents", {
  id: text("id").$type<DocumentId>().primaryKey(),                      // TypeID `document_…`, app-minted
  ownerId: text("owner_id").$type<UserId>().notNull()                   // KEEP (D23 — top-level owned canon)
    .references(() => users.id, { onDelete: "cascade" }),
  // the original uploaded bytes live in the per-user CAS (D21); FK the asset index row
  sourceAssetId: text("source_asset_id").$type<AssetId>()               // null for hand-typed Notepad docs
    .references(() => assets.id, { onDelete: "set null" }),
  name: text("name").notNull(),                                         // display filename / scrape title
  mime: text("mime").notNull(),                                         // application/pdf, text/markdown, …
  origin: text("origin", { enum: DOC_ORIGINS }).notNull(),             // 'upload'|'web'|'youtube'|'wiki'|'text'
  extractedText: text("extracted_text").notNull(),                     // THE CANON (binary→text, re-runnable)
  importHash: text("import_hash").notNull(),                            // sha-256 of source bytes (re-upload dedup)
  byteSize: integer("byte_size").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [ uniqueIndex("documents_owner_hash_unique").on(t.ownerId, t.importHash) ]);  // within-user dedup
```
> Open: store `extractedText` inline (TEXT) vs as a CAS text blob. Lean **inline** for v1 (SQLite handles it,
> exact-scan scale); promote to a CAS blob only if doc sizes hurt. The chunk slices in `document_chunks`
> duplicate spans of it — same as `chat_segments` duplicating message text; acceptable, both derive.

### 7.2 `document_chunks` — NEW derived vector table (`@orb/db/schema/embeddings.ts`), the 5th VECTOR_TABLE
```ts
export const documentChunks = sqliteTable("document_chunks", {
  id: text("id").$type<DocumentChunkId>().primaryKey(),
  documentId: text("document_id").$type<DocumentId>().notNull()        // PRODUCER FK — the ONLY ownership link
    .references(() => documents.id, { onDelete: "cascade" }),          //   (owner derives via documents.ownerId, D20)
  chunkIdx: integer("chunk_idx").notNull(),                            // reading order (restore on retrieve, like ST `index`)
  content: text("content").notNull(),                                  // the verbatim slice (chat_segments analogue)
  embedding: vector32("embedding", { dimensions: 1024 }).notNull(),    // the one Qwen3-VL space
  contentHash: text("content_hash").notNull(),                        // staleness gate + fork/dedup collapse key
  hubScore: real("hub_score"),                                        // discovery-only write; store never nulls it
  model: text("model").notNull(), dim: integer("dim").notNull(),      // (model,dim) space tag
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [
  uniqueIndex("document_chunks_doc_chunk_model_unique").on(t.documentId, t.chunkIdx, t.model), // idempotent upsert key
  index("document_chunks_document_idx").on(t.documentId),
]);
```
> **NO `ownerId`** (D20). Structurally identical to `chat_segments` (slice + embedding + producer FK +
> content_hash + space tag). Re-chunk/re-embed regenerates it from `documents.extractedText`.

### 7.3 The 3 scope junctions (`@orb/db/schema/databank.ts`), per-type FK — NO polymorphic table (D24)
```ts
export const globalDocuments = sqliteTable("global_documents", {          // ST 'global' → single-owned (D21)
  ownerId: text("owner_id").$type<UserId>().notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: text("document_id").$type<DocumentId>().notNull().references(() => documents.id, { onDelete: "cascade" }),
}, (t) => [ primaryKey({ columns: [t.ownerId, t.documentId] }) ]);

export const characterDocuments = sqliteTable("character_documents", {    // ST 'character' → derive via FK (D23)
  characterId: text("character_id").$type<CharacterId>().notNull().references(() => characters.id, { onDelete: "cascade" }),
  documentId: text("document_id").$type<DocumentId>().notNull().references(() => documents.id, { onDelete: "cascade" }),
}, (t) => [ primaryKey({ columns: [t.characterId, t.documentId] }) ]);

export const chatDocuments = sqliteTable("chat_documents", {              // ST 'chat' → membership-scoped (D18)
  chatId: text("chat_id").$type<ChatId>().notNull().references(() => chats.id, { onDelete: "cascade" }),
  documentId: text("document_id").$type<DocumentId>().notNull().references(() => documents.id, { onDelete: "cascade" }),
}, (t) => [ primaryKey({ columns: [t.chatId, t.documentId] }) ]);
```
> Mirrors world-info's `global_books`/`character_books`/`chat_books` exactly. Junction rows carry no
> `ownerId` (owner derives via the `documentId` FK, D23). Add a junction per kind, never a `(type,id)` soft ref.

### 7.4 The embeddings tuple extension (additive — `embeddings/contract/params.ts`)
```ts
export const SOURCE_KINDS = ["card", "avatar", "document"] as const;             // + 'document'  (P5/6 add-when-built)
export const TEXT_LENSES  = ["card-text", "chunk"] as const;                     // + 'chunk'      (the FLAG[PD-34] pattern)
export const VECTOR_TABLES = [..., "document_chunks"] as const;                  // + the 5th table
// + a discriminated store arm:
export interface DocumentChunkStoreParams {
  readonly kind: "document"; readonly lens: "chunk";
  readonly documentId: DocumentId; readonly chunkIdx: number;
  readonly content: string; readonly model: string; readonly dim: number;
}
```

### 7.5 The retrieval lens signature (additive — `search/contract/service.ts`)
```ts
// scope is DERIVED (host-only v1): the union of global/character/chat junction doc-ids the actor may see.
documents(params: {
  scope: { chatId: ChatId } | { ownerId: UserId };   // chat turn (host-only union) | ad-hoc personal search
  queryText: string; k: number; minScore?: number; rerank?: boolean;
}): Promise<DocumentChunkHit[]>                       // sorted by chunkIdx within doc (reading order), then dedup
```

---

## 8. Born-compliant-before-Phase-5 bits

**Almost nothing must be reserved now — databank is a clean additive graft, and that is by design.** The
precedent is explicit: the embeddings `SOURCE_KINDS` tuple does NOT pre-reserve `chat-block` — it carries a
`FLAG[PD-34]` note to add the member *when memory is built in Phase 5*, guided by the `satisfies` belt going
red. Databank follows the identical add-when-built path for `'document'`/`'chunk'`/`document_chunks`.

What this means concretely:
- **No mandatory before-Phase-5 schema work.** `document_chunks` lands in the same 1024-dim space
  automatically (it uses the same `embed` role); nothing about the current substrate needs to change to keep
  it comparable later.
- **One *optional* cheap reservation, IF chat-assembly macros get finalized before databank:** the
  `{{databank}}` macro slot, parallel to the already-reserved `{{world_state}}` slot in
  `@orb/contracts/memory` (`CLIP_KINDS` etc. are reserved-now-with-zero-behavior). If the chat macro union is
  locked during Phase 5, add `{{databank}}` as a reserved dynamic/cache-safe slot then — additive, zero
  behavior. Not required; it can also be added with the feature.
- **Everything else is build-whole work** post-decision: the `documents` canon + junctions, `infra/extraction`,
  `@orb/kit/chunk`, the scraper verbs, the `search.documents` verb, the chat GATHER branch.

The `FLAG[PD-x]` Promotion/Relocation Debt convention (ledger 14c) is the right vehicle: if greenlit, drop a
`FLAG[PD-57]` on the embeddings tuples + the search scope union now, so the add-when-built site is
discoverable.

---

## 9. Difficulty, sequencing, open questions, recommendation

### 9.1 Difficulty
**ARCHITECTURAL but the cheapest ARCHITECTURAL on the board** — because the canon/derived split maps 1:1
onto two existing patterns (world-info junctions for ownership, chat_segments for the vector substrate), the
new surface is bounded and well-precedented. Real costs: the vendored extraction loader (pdfjs/mammoth/epub
— the genuinely fiddly, dependency-heavy part), the new canon tables, and the chunker. ~70% of the pipeline
(store path, search engine, CAS, ownership idioms, embed role) is reuse.

### 9.2 Sequencing (depends on Phase 4 substrate + Phase 5 chat)
1. **Prereq:** `embeddings` + `search` + `assets` built (Phase 4 — in progress). Cannot start before.
2. `@orb/kit/chunk` (pure, testable in isolation — can land any time).
3. `infra/extraction` (vendored loader; the long pole — start the dependency vetting early if greenlit).
4. `@orb/db/schema/databank` + `document_chunks` in `schema/embeddings` + the embeddings/search additive arms.
5. `domain/databank` (CRUD + ingest subsystem + junctions). Owner-scoped retrieval testable here without chat.
6. **Chat-assembly integration** (the `{{databank}}` GATHER branch) — lands with/after chat is whole (D16).
7. Scrapers (web/youtube/wiki) — fast-follow.
8. Client panel (Phase 6).

### 9.3 Open questions
- **`extractedText` inline TEXT vs CAS text blob** (lean inline for v1).
- **Chunk params: global default vs per-document override** (ST has per-bank settings; lean a single
  user-setting `{chunkSize, overlap, sizeThreshold, k, minScore}` in `settings`, override deferred).
- **Whole-file-if-small threshold** (ST: ≤5 KB embedded whole). Keep it — cheap, avoids over-chunking.
- **Scope-first cut for v1** (see recommendation).
- **docx/epub vendoring** — confirm mammoth + epub.js licenses/bundle size before committing; txt/md/pdf/html
  cover most value with lighter deps.
- **Multi-human widening** — when (if ever) to move from host-only to a membership-gated union (free per D16).
- **Re-extract on extractor upgrade** — a `reindex` workload re-runs extract+chunk+embed; the original bytes
  in CAS make it possible. Confirm the workload trigger (a `connection`/`settings` change, like the embed-model
  re-index).

### 9.4 RECOMMENDATION
**Build it — yes — but as a post-chat (Phase 6/7) additive graft, and scope v1 to global + chat document
scopes with owner/host-only retrieval.** Rationale:
- "RAG over my own documents" is a high-value, frequently-requested capability and the single most
  substantial ST feature orbweaver lacks; the gap register flags it as the one OPEN call precisely because
  it's worth a real decision.
- The substrate makes it cheaper than its ARCHITECTURAL tag implies — the producer/derived and
  ownership/junction patterns already exist and are battle-specified; this is a graft, not a greenfield
  subsystem.
- It fits the constitution cleanly (single canon producer + derived vectors + per-type FK junctions +
  host-only derived scope) with **zero relitigation** of D18/D20/D21/D23/D24 — every one of them is
  *satisfied*, not bent.

**Scope v1:** global (personal bank) + chat scope (per-chat docs) — the two highest-value scopes; character
scope as fast-follow (one more junction + scope branch). **Extractors v1:** txt/md/pdf/html (lighter deps,
~90% of real use); docx/epub fast-follow. **Scrapers v1:** file + text + web; youtube/wiki fast-follow.
**Retrieval v1:** owner-scoped, host-only in groups (D16 mirror). If the answer is "not now," the cost of
deferring is **zero** — nothing in the current substrate needs to change to keep databank a clean additive
graft later (the `FLAG[PD-57]` note is the only thing to drop).

---

## 10. Cross-references
- **The OPEN call + the gap line:** ledger **D47**; `reports/sillytavern-feature-gap.md` §4 (Attachments /
  Data Bank / Vectors-as-file-RAG / Server doc text-extraction / Scrapers rows).
- **Ownership categories + no-polymorphic + no-global-tier:** ledger **D18 / D20 / D21 / D23 / D24**.
- **The vector substrate (write path, source-kinds, derive-don't-stamp, content_hash, hub_score):**
  `domains/embeddings.md`; `embeddings/contract/params.ts`; `db/schema/embeddings.ts`;
  `spine/knowledge-cluster.md`.
- **The retrieval engine (lenses, CSLS, rerank, threshold, reading-order, vector-scope-derived):**
  `domains/search.md`; `reports/ENFORCEMENT.md` (`vector-scope-derived` gate).
- **The ownership/junction precedent (single-owned books + per-type FK scope junctions + pool union):**
  `domains/world-info.md`; `db/schema/world-info.ts`.
- **The per-user CAS (original bytes, owner-gating, magic sniff, AssetKind):** `domains/assets.md`; ledger
  **D21**.
- **Host-only group retrieval (the multi-human leak resolution):** ledger **D16**; `domains/chat.md` Part III.
- **Reserved-slot precedent (`{{world_state}}` / CLIP tuples):** `@orb/contracts/memory`; ledger §5.
- **Pure-engine homes in kit (the chunker's neighbors):** `@orb/kit/{macro,regex,world-info}`.
- **Constitution:** `structure.md` (the cake, 8-slot template, gates); `spine/types-and-schemas.md` (one
  home / derive / cross-boundary → contracts).
- **ST source:** `public/scripts/extensions/{attachments,vectors}/index.js`; `public/scripts/{chats,scrapers,utils}.js`.
- **PD convention:** ledger 14c (Promotion/Relocation Debt registry; `FLAG[PD-x]`).
```