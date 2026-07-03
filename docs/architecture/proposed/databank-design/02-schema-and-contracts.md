---
kind: spec
status: active
updated: 2026-07-03
---

# 02 — Schema (full DDL) and Contracts

> **Status: COMMITTED (D49 item 5) — prescriptive design; the ledger D-entry wins on any conflict.**
> The `documents` and `document_chunks` DDL below carries the committed one-pager's tables forward
> verbatim, plus argued ADDITIVE extensions (§1.1, §2.1 — flagged in the README for lead sign-off).
> The three junctions are written out in full (they were a stub comment in the one-pager). All
> timestamps are ms-epoch integers with the injected-clock discipline; all ids are app-minted
> TypeIDs via the branded-id belt.

---

## 1. `documents` — the NEW canon producer (`@orb/db/schema/databank.ts`)

```ts
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { DOC_ORIGINS } from "@orb/contracts/databank";
// AssetId/UserId/DocumentId branded types from their canonical homes

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").$type<DocumentId>().primaryKey(), // TypeID `document_…`, app-minted
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // top-level owned canon (D23 KEEP)
    // original uploaded bytes live in the per-user CAS (D21); NULL for origin 'text' (nothing to re-extract)
    sourceAssetId: text("source_asset_id")
      .$type<AssetId>()
      .references(() => assets.id, { onDelete: "set null" }),
    name: text("name").notNull(), // display filename / scrape title; mutable metadata (rename verb)
    mime: text("mime").notNull(), // application/pdf, text/markdown, …
    origin: text("origin", { enum: DOC_ORIGINS }).notNull(), // 'upload'|'web'|'youtube'|'wiki'|'text'
    sourceUrl: text("source_url"), // scrape provenance; NULL for upload/text        [EXTENSION §1.1]
    extractedText: text("extracted_text").notNull(), // THE CANON (binary → text, re-runnable)
    importHash: text("import_hash").notNull(), // sha-256 of the SOURCE BYTES (re-upload dedup);
    //   for origin 'text' (no bytes): sha-256 of extractedText — same dedup semantics, one column
    byteSize: integer("byte_size").notNull(), // source-byte size; for 'text': extractedText UTF-8 length
    extractorVersion: text("extractor_version").notNull(), // EXTRACTOR_VERSION at extract time    [EXTENSION §1.1]
    //   for origin 'text': "none" (no extractor ran; excluded from re-extract sweeps)
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`), //                                        [EXTENSION §1.1]
  },
  (t) => [
    // within-user dedup; the (ownerId, …) prefix also serves every list-by-owner query — no second index
    uniqueIndex("documents_owner_hash_unique").on(t.ownerId, t.importHash),
  ],
);
```

### 1.1 The argued extensions (additive; committed columns untouched)

- **`updatedAt` — ADDED.** Bumped by `rename` and by a re-extract (`databank-reindex
  mode:'re-extract'` rewrites `extractedText`). WHY: without it, a re-extract is invisible — "why
  did my chunks change?" has no answer, and the client panel cannot sort by activity. REJECTED:
  no-`updatedAt` (the one-pager's minimal shape) — canon that can be rewritten in place
  (re-extract) needs a visible write timestamp; `createdAt` alone lies after the first re-extract.
- **`extractorVersion` — ADDED.** Stamped from `infra/extraction`'s `EXTRACTOR_VERSION` (doc 04 §4)
  at extract time. WHY: it is the re-extract-on-upgrade trigger's selection predicate
  (`WHERE extractor_version != current AND source_asset_id IS NOT NULL`) — without the stamp, an
  upgrade must re-extract EVERYTHING or nothing. REJECTED: folding the version into `importHash`
  (would break re-upload dedup — the same bytes would stop deduping across extractor upgrades).
- **`sourceUrl` — ADDED.** WHY: scrape provenance (the panel shows where a doc came from; a
  re-scrape verb becomes possible later without a schema change). REJECTED: encoding the URL into
  `name` (lossy, unqueryable). ST stores the URL as the attachment's identity; we keep it as
  metadata only — identity is the TypeID.

### 1.2 What is deliberately NOT on `documents`

- **No chunk params (chunkSize/overlap) column.** Chunk params are a single user-setting v1 (doc 08
  §4 Q2); the applied params are not stamped because the derived layer is fully re-runnable — a
  param change triggers reindex, and the unique `(documentId, chunkIdx, model)` + prune keep the
  chunk set coherent. REJECTED: a per-document params blob — a second config home for an unproven
  need (the flip criterion is in doc 08 §4).
- **No `ingestState` status column.** Ingest progress is DERIVED (chunk/embedded counts via a
  LEFT JOIN in `toDocumentView`; an active `databank-ingest` workload row is the "in flight"
  signal). WHY: derive-don't-stamp — a crashed ingest self-heals on retry (idempotent, doc 06 §3)
  with no stuck flag to reconcile. REJECTED: a `status` enum column — a second source of truth that
  lies after a crash and needs its own repair path.

---

## 2. `document_chunks` — the 5th vector table (`@orb/db/schema/embeddings.ts`)

```ts
export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").$type<DocumentChunkId>().primaryKey(),
    documentId: text("document_id")
      .$type<DocumentId>()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }), // PRODUCER FK — the only ownership link
    chunkIdx: integer("chunk_idx").notNull(), // reading order; restore-on-retrieve (ST `index`)
    content: text("content").notNull(), // the verbatim slice (chat_segments analogue)
    charStart: integer("char_start").notNull(), // offsets into documents.extractedText  [EXTENSION §2.1]
    charEnd: integer("char_end").notNull(), //   (exclusive; the non-overlap span)       [EXTENSION §2.1]
    embedding: vector32("embedding", { dimensions: 1024 }).notNull(), // the one Qwen3-VL space
    contentHash: text("content_hash").notNull(), // staleness gate + dedup collapse key
    hubScore: real("hub_score"), // discovery-only write; store never nulls it; v1 always NULL (doc 05 §3.6)
    model: text("model").notNull(),
    dim: integer("dim").notNull(), // (model,dim) space tag
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("document_chunks_doc_chunk_model_unique").on(t.documentId, t.chunkIdx, t.model), // idempotent upsert key
    index("document_chunks_document_idx").on(t.documentId),
  ],
);
```

**NO `ownerId`** (D20). Structurally identical to `chat_segments`. Re-chunk/re-embed regenerates it
from `documents.extractedText`; document delete CASCADEs it away.

### 2.1 The argued extension: `charStart`/`charEnd`

The chunker already computes exact offsets (doc 03 §2). Storing them: (a) lets the Phase-6 panel
highlight a retrieved chunk in the source document without re-running the chunker, (b) makes the
round-trip ingest test assert lossless coverage (`slice(charStart, charEnd)` spans partition the
canon), (c) survives a chunk-param change on the READ side (old hits still locate correctly in the
unchanged canon). REJECTED: content-only rows (locating a chunk requires re-chunking with the
byte-identical params that produced it — brittle, and impossible after a param change). Cost: two
integers per row.

### 2.2 `updatedAt` on `document_chunks` — REJECTED

Derived rows are replaced, never edited: a content change means a different `contentHash` and a
fresh upsert; a shrunk chunk set is pruned (doc 05 §2.4). `createdAt` + the hash tell the whole
staleness story; an `updatedAt` on a derived row would imply in-place mutation that the substrate
forbids. (Same reasoning as `chat_segments`, which carries none.)

---

## 3. The 3 scope junctions (`@orb/db/schema/databank.ts`) — full DDL

Per-type FK, two-column PKs, CASCADE both sides, NO `ownerId` stamp on any junction (D23 — owner
derives via the `documentId` FK; for `global_documents` the `ownerId` column IS the scope subject,
not a stamp). Mirrors `world_books`' scope-junction family exactly.

```ts
export const globalDocuments = sqliteTable(
  "global_documents", // ST 'global' → single-owned personal bank (D21 — not a global tier)
  {
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .$type<DocumentId>()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.documentId] }), // scope-first: "all my global docs" is a PK prefix scan
    index("global_documents_document_idx").on(t.documentId), // reverse: "where is this doc attached"
  ],
);

export const characterDocuments = sqliteTable(
  "character_documents", // ST 'character' → derive via per-type FK (D23)
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .$type<DocumentId>()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.documentId] }),
    index("character_documents_document_idx").on(t.documentId),
  ],
);

export const chatDocuments = sqliteTable(
  "chat_documents", // ST 'chat' → membership-scoped (D18)
  {
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .$type<DocumentId>()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.documentId] }),
    index("chat_documents_document_idx").on(t.documentId),
  ],
);
```

**Cascade posture, spelled out:** delete a document → its junction rows AND its chunks vanish
(CASCADE); delete a character/chat/user → that scope's junction rows vanish, the DOCUMENT survives
(it is owner-canon, not scope-canon); delete a user → their documents cascade (owner FK), which
cascades chunks + junctions. No orphan sweeps, no reaper.

**All three tables ship in the v1 migration** even though the character-scope VERBS are
fast-follow. WHY: the shape is fully decided; a second migration for a known table is pure churn
(the rpg precedent — tables ride the baseline squash). REJECTED: deferring `character_documents`
to the fast-follow (a migration + a schema-file touch later, for zero saved risk now).

### 3.1 Reverse-index decision

The two-column PK serves scope→documents; the added `*_document_idx` serves document→scopes
(`listAttachments`, the panel's "attached to" chips, and detach-all UX). WHY: without it, every
`listAttachments` is three table scans. REJECTED: relying on PK only (the reverse lookup is a real
verb, not a hypothetical).

---

## 4. `@orb/contracts/databank` — the wire (zod, in full)

```ts
import { z } from "zod";
import type { ChunkParams } from "@orb/kit/chunk"; // contracts depends down on kit — legal

// ── the origin axis (ONE canonical tuple; §7.5 no-inline-union-redecl) ─────────
export const DOC_ORIGINS = ["upload", "web", "youtube", "wiki", "text"] as const;
export const docOriginSchema = z.enum(DOC_ORIGINS);
export type DocOrigin = z.infer<typeof docOriginSchema>;

// ── the scraper subset (derives from the origin axis; not a second spelling) ──
export const SCRAPER_KINDS = ["web", "youtube", "wiki"] as const satisfies readonly DocOrigin[];
export const scraperKindSchema = z.enum(SCRAPER_KINDS);
export type ScraperKind = z.infer<typeof scraperKindSchema>;

// ── chunk params (the wire twin of @orb/kit/chunk's ChunkParams; pinned by satisfies) ──
export const chunkParamsSchema = z.object({
  chunkSize: z.number().int().min(200).max(20_000).default(2500), // chars — ST chunk_size_db
  overlapPercent: z.number().int().min(0).max(50).default(0), // ST overlap_percent_db
  wholeFileThreshold: z.number().int().min(0).max(100_000).default(5120), // chars — ST size_threshold_db 5KB
});
export type ChunkParamsWire = z.infer<typeof chunkParamsSchema>;
// compile-time pin: the wire shape IS the kit shape (drift fails tsc here, not at a call site)
const _pin = {} as ChunkParamsWire satisfies ChunkParams;

// ── retrieval settings (the user-setting blob; doc 08 §4 Q2) ──────────────────
export const databankRetrievalSettingsSchema = z.object({
  k: z.number().int().min(1).max(50).default(5), // ST chunk_count_db
  minScore: z.number().min(0).max(1).default(0.25), // ST score_threshold
  rerank: z.boolean().default(false), // LEAN default off (doc 05 §3.5)
});
export const databankSettingsSchema = z.object({
  chunk: chunkParamsSchema,
  retrieval: databankRetrievalSettingsSchema,
});
export type DatabankSettings = z.infer<typeof databankSettingsSchema>;

// ── the client-facing document view ───────────────────────────────────────────
export const documentViewSchema = z.object({
  id: documentIdSchema, // the branded TypeID schema from the id belt
  name: z.string().min(1),
  mime: z.string(),
  origin: docOriginSchema,
  sourceUrl: z.string().url().nullable(),
  byteSize: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative(), // extractedText.length — derived at read
  chunkCount: z.number().int().nonnegative(), // derived (LEFT JOIN count; active model only)
  embeddedCount: z.number().int().nonnegative(), // = chunkCount when ingest is complete
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type DocumentView = z.infer<typeof documentViewSchema>;
```

`extractedText` is deliberately NOT on `DocumentView` (list payloads would haul megabytes); a
dedicated `get` with `includeText: true` (doc 06 §1) returns it for the panel's source view.

---

## 5. Domain-internal contract shapes (`domain/databank/contract/`)

Every verb's params/results zod lives in `contract/params.ts` / `results.ts` — written out in doc
06 §1 next to its verb (single listing, no duplication here). Errors:

```ts
// contract/errors.ts
export class DocumentNotFoundError extends Error {} // fetchOwned miss → 404 semantics
export { ExtractionFailedError, UnsupportedDocTypeError } from "@orb/contracts/extraction"; // one declaration (doc 04 §3)
```

---

## 6. The `document` AssetKind (the assets-domain delta)

- `@orb/contracts/assets`: `ASSET_KINDS` gains `"document"` (additive tuple member; the db enum
  derives from the same tuple — the D34 pattern already governing this file).
- **Magic-sniff posture (decision):** `assets/substrate/mime.ts` `sniffMime` gains two signatures —
  `%PDF` (pdf) and `PK\x03\x04` (zip — the docx/epub container). Text-family mimes
  (`text/plain|markdown|html`) have no magic; for those, `store(..., { enforceMagic: true })` falls
  back to an **UTF-8 validity check + a size cap** instead of a signature match. WHY: the existing
  image-only sniff would reject every document upload; a strict-UTF-8 decode is the strongest
  cheap check a text format admits (binary garbage fails it). REJECTED: `enforceMagic: false` for
  document uploads (drops the belt entirely — a mislabeled binary would land in the CAS and then
  fail extraction confusingly late). The upload size cap is an AppSettings value, default 20 MB
  (LEAN; criterion: a real user hitting it — raise then, per-instance).
