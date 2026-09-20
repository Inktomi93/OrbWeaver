// schema/embeddings — the vector substrate (producer: domain/embeddings; the ONE write path is
// `embeddings.store`, the inserter is the domain — the SCHEMA is here). Five primary vector tables:
// character_embeddings · image_embeddings · chat_digests · chat_segments · document_chunks (MOVED out
// of the neo `search.ts` lie — the producer, not the consumer, names the schema file; `chat_digest_speakers`
// is a separate identity-keyed join, not a vector table). Authoritative spec: the domain
// module (`packages/server/src/domain/embeddings/`) + `core/Knowledge-Cluster.md` + `core/Tier-1-DB.md`.
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • D20 — the vector substrate does NOT denormalize ownership: there is NO `ownerId` / `owner_idx` on
//     ANY of these tables. A row carries only its PRODUCER FK (characterId / assetId / chatId, all NOT
//     NULL); owner-scope is DERIVED at search time from the producer (membership `chatId ∈ {my chats}`
//     for digests/segments; `characters.ownerId` for card embeds; the now-per-user owned asset, D21, for
//     images). Enforced downstream by the `vector-scope-derived` gate.
//   • D28 — `character_versions` is GONE: `character_embeddings.characterId` FKs `characters.id` (the
//     live card); there is NO `characterVersionId` on any table (was a chat-pinning artifact).
//   • content_hash on ALL five primary tables (notNull) — the staleness gate (re-embed iff the hash
//     changed) + the cross-chat collapse key (fork/import copies with identical content collapse to one
//     hit). Replaces the neo `character_embeddings.sourceText` divergence.
//   • hub_score on ALL five primary tables — the advisory-stale CSLS ranking signal. Written ONLY by
//     `discovery` via `embeddings.writeHubScores`, read by `search`. A vector write (`embeddings.store`)
//     MUST NOT null it (the neo reset-in-3-places bug). It is nullable + never defaulted by a store.
//   • The `(model, dim)` space tag on every row — `search`/`memory` compare ONLY within one space; the
//     same model on different backends is the same space (free switch), a different model/dim is its own
//     space (re-index workload). PD-104: ALL FIVE producers key their idempotent upsert ON `model`
//     (character/image/document_chunks always did; chat_segments/chat_digests were fixed to match — they
//     used to OMIT model and overwrite the old space in place, an inconsistency with the orphaning
//     character/image tables). So a model change is uniformly PURGE + REINDEX: the new space is written
//     additively (no overwrite, no inconsistent orphan), then the stale old-space rows are purged
//     (`embeddings/persistence purgeStaleVectors`, folded into the bulk `index` reindex) — never stranded.
//
// `image_embeddings.lens` DERIVES the canonical `IMAGE_LENSES` tuple from `@orb/contracts/embeddings`
// (D34 — promoted out of the server tier so db can derive; db deps are kit + contracts + drizzle only).
// The column carries both the drizzle `{ enum }` (type-side) AND a CHECK built from the same tuple
// (SQL-side) — never a re-spelled union; a `.int` test-mirror pins the column enum === the contracts
// tuple. `chat_digests.scopedCharacterId` is ALWAYS a real branded `CharacterId` FK → `characters.id`
// (core/Knowledge-Cluster.md §4 / inv 8 — solo's cast char, the synthetic group-as-character, or a per-
// witnessing-char; NO `''` sentinel, NO NULL). The `(chatId, scopedCharacterId, tier, blockIdx)`
// idempotent-upsert UNIQUE keys off the real id; SQLite UNIQUE never sees a NULL here.
//
// Timestamps are plain `integer("x_at")` epoch-MS NUMBERS, born at insert via `(unixepoch() * 1000)`.
// `embedding` is the native `vector32` F32_BLOB column (../custom-types). `chat_digest_speakers` is an
// identity-keyed join (composite PK — there is no TypeID brand for it).

import type { ImageCaptionMeta } from "@orb/contracts/embeddings";
import { IMAGE_LENSES, IMAGE_SKIP_REASONS, VECTOR_SCOPES } from "@orb/contracts/embeddings";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterId,
  ChatDigestId,
  ChatId,
  ChatSegmentId,
  DocumentChunkId,
  DocumentId,
  ImageEmbeddingId,
  UserId,
} from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use primaryKey({ columns }).
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { vector32 } from "../custom-types/index.ts";
import { checkList } from "../kit/check-list.ts";
import { assets } from "./assets.ts";
import { characters } from "./character.ts";
import { chats } from "./chat.ts";
import { documents } from "./databank.ts";
import { users } from "./users.ts";

// The one 1024-dim space (Qwen3-VL, text↔image cosine-comparable — core/Knowledge-Cluster.md §1). Every
// `embedding` column is F32_BLOB(1024); the row's `dim` column records it for the `(model, dim)` space tag.
//
// `dim` IS DELIBERATELY UNCONSTRAINED against the physical F32_BLOB width, and this is a recorded
// ACCEPTANCE rather than a gap (#1378 item 5, reachability traced): a writer cannot diverge — every store
// goes through `domain/embeddings/verbs/store.ts`, whose `assertSpace` THROWS on a mismatch before the
// insert — and the only reader of `dim` uses it as a filter TAG (`domain/search/persistence/nearest.ts`
// scopes a query to a `(model, dim)` space), never to size-decode a blob. A CHECK pinning `dim = 1024`
// would also have to be edited the day a second space is added, which is exactly the migration the tag
// exists to make possible. Not worth a constraint; worth not re-deriving.
const VECTOR_DIM = 1024;

// CHECK list derived from the canonical tuple (NOT re-spelled): `lens in ('image-raw', 'image-captioned')`.
const IMAGE_LENS_CHECK_LIST = checkList(IMAGE_LENSES);

// CHECK list derived from the canonical tuple (NOT re-spelled): `reason in ('below-dimension-floor')`.
const IMAGE_SKIP_REASON_CHECK_LIST = checkList(IMAGE_SKIP_REASONS);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// character_embeddings — the CARD lens (one lens: `card-text`). FK `characters.id` (D28 — NOT a cv). NO
// ownerId (D20 — scope derives via `characters.ownerId`). content_hash is the staleness/collapse key.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const characterEmbeddings = sqliteTable(
  "character_embeddings",
  {
    // TypeID PK (`character_embedding_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<CharacterEmbeddingId>().primaryKey(),
    // The producer FK (D28 — keys on the live card `characters.id`, NOT a retired cv). CASCADE: a deleted
    // character drops its embedding. This is the ONLY ownership link (owner derives via characters.ownerId).
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // The native vector (F32_BLOB(1024), raw little-endian — ../custom-types).
    embedding: vector32("embedding", { dimensions: VECTOR_DIM }).notNull(),
    // The staleness gate + cross-chat collapse key (replaces neo's `sourceText` comparison). NOT NULL.
    contentHash: text("content_hash").notNull(),
    // The advisory-stale CSLS mean-cosine ranking signal (a FLOAT) — written ONLY by `discovery` via
    // `writeHubScores`, read by `search`. A vector write (`embeddings.store`) MUST NOT touch it (the neo
    // reset bug); nullable, never defaulted by a store. Do NOT add a default or write it from the store path.
    hubScore: real("hub_score"),
    // The `(model, dim)` space tag — `search`/`memory` compare only within one space.
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One row per character per embedding space — the hash-gated upsert's ON CONFLICT target.
    uniqueIndex("character_embeddings_character_model_unique").on(t.characterId, t.model),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// image_embeddings — the AVATAR lenses. TWO lenses per asset (`image-raw` + `image-captioned`) coexist in
// the one space → `unique(assetId, model, lens)`. `lens` derives IMAGE_LENSES (D34) + a tuple-built CHECK.
// FK `assets.id` (per-user, D21); NO ownerId (D20 — scope derives via the owned asset). NO ownerId column.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const imageEmbeddings = sqliteTable(
  "image_embeddings",
  {
    // TypeID PK (`image_embedding_…`); brand is type-only, SQL is plain TEXT.
    id: text("id").$type<ImageEmbeddingId>().primaryKey(),
    // The producer FK (the per-user owned asset, D21). CASCADE: a deleted asset drops its embeddings. This
    // is the ONLY ownership link (owner-scope derives via the owned asset — no ownerId on the vector row).
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // The native vector (F32_BLOB(1024)).
    embedding: vector32("embedding", { dimensions: VECTOR_DIM }).notNull(),
    // image-raw | image-captioned — derives IMAGE_LENSES (@orb/contracts/embeddings, D34). The `enum`
    // option is type-only; the CHECK below is the SQL-level guard. Both lenses coexist per (asset, model).
    lens: text("lens", { enum: IMAGE_LENSES }).notNull(),
    // The generated caption (only for the `image-captioned` lens) + its VL breakdown / provenance sidecar.
    // Nullable — the `image-raw` lens carries neither.
    caption: text("caption"),
    // TYPED, deliberately (issue #164 + the open-json-column-key-parity gate): this column was
    // `Record<string, unknown>` while discovery read fourteen named facet paths off it and both writers
    // stored `{model}` — the reader-with-no-producer defect. `ImageCaptionMeta` is the ONE home of that
    // vocabulary (@orb/contracts/embeddings) and it is `.loose()`, so a row written before the breakdown
    // landed (and any future facet) still round-trips. The type is now the enforcer on both sides.
    captionMeta: text("caption_meta", { mode: "json" }).$type<ImageCaptionMeta>(),
    // The staleness/collapse key. Both lenses for one asset share a content_hash (the resized bytes), so a
    // re-index de-dups. NOT NULL.
    contentHash: text("content_hash").notNull(),
    // Advisory-stale CSLS mean-cosine hub score (a FLOAT) — RESERVED for image↔image use only (cross-modal
    // cosine scale mismatch means `search` deliberately omits it on text→image paths; core/Knowledge-Cluster.md
    // esoteric #2). Written ONLY by `discovery`; a vector write MUST NOT null it. Nullable, never defaulted.
    hubScore: real("hub_score"),
    // The `(model, dim)` space tag.
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // Both lenses coexist idempotently per (asset, model): the upsert key. A re-embed of the same lens
    // collides here (ON CONFLICT DO UPDATE), so the table never doubles a lens for an asset in one space.
    uniqueIndex("image_embeddings_asset_model_lens_unique").on(t.assetId, t.model, t.lens),
    // SQL-side enum enforcement derived from the tuple (mirrors the drizzle `{ enum }` type-side).
    check("image_embeddings_lens_check", sql.raw(`lens in (${IMAGE_LENS_CHECK_LIST})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_digests — the DISTILLED chat-block lens (the stored digest `text` = topic anchor + significance-
// filtered facts + keywords; the §2b body that fills `{{memory}}` AND is embedded), tiered. Keyed
// `(chatId, scopedCharacterId, tier, blockIdx)` — the idempotent-upsert UNIQUE. FK chats CASCADE; NO
// ownerId (D20); NO characterVersionId (D28). `scopedCharacterId` is ALWAYS a real `CharacterId` FK →
// `characters.id` CASCADE (§4 / inv 8 — solo's cast char, the synthetic group-as-character, or a per-
// witnessing-char; NEVER the `''` sentinel, NEVER NULL).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatDigests = sqliteTable(
  "chat_digests",
  {
    // TypeID PK (`chat_digest_…`); brand is type-only, SQL is plain TEXT.
    id: text("id").$type<ChatDigestId>().primaryKey(),
    // The producer FK. CASCADE: a deleted chat drops its digests. The ONLY ownership link (owner-scope
    // derives via chat membership at search time — D20).
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The egocentric scope key (core/Knowledge-Cluster.md §4 / inv 8): ALWAYS a real `CharacterId` — solo's
    // single cast char, the synthetic group-as-character (`__group__${chatId}`, a real hidden id), or a
    // per-witnessing cast char under `scoped`. FK → characters.id CASCADE (a deleted character drops its
    // scoped digests). NEVER the `''` sentinel, NEVER NULL — the UNIQUE below keys off the real id.
    scopedCharacterId: text("scoped_character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // True when the block is from a group room (drives the egocentric-vs-shared recall split).
    isGroup: integer("is_group", { mode: "boolean" }).notNull().default(false),
    // The consolidation tier (0 = a single block; k>0 = a fanOut cross-block synthesis).
    tier: integer("tier").notNull(),
    // The block index within the chat (the `(chatId, blockIdx)` span pointer back to canon).
    blockIdx: integer("block_idx").notNull(),
    // The distilled digest body (§2b: topicAnchor + significance-filtered facts + keywords, folded into one
    // stored text). What fills `{{memory}}` AND what is embedded. A digest always has a body — NOT NULL.
    text: text("text").notNull(),
    // The native vector (F32_BLOB(1024)) — the distilled lens embedding (the sharp search key).
    embedding: vector32("embedding", { dimensions: VECTOR_DIM }).notNull(),
    // The staleness/collapse key. NOT NULL.
    contentHash: text("content_hash").notNull(),
    // Advisory-stale CSLS mean-cosine hub score (a FLOAT) — discovery-only write, never nulled by a store.
    hubScore: real("hub_score"),
    // The mandatory first line of the digest (`[entities — scene]`) — kept as a retrieval facet.
    topicAnchor: text("topic_anchor"),
    // The 15–30 distinctive retrieval keywords (always a list; the lexical retrieval anchors).
    keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    // The `(model, dim)` space tag.
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The idempotent-upsert key — the scope bucket PLUS `model` (PD-104): every one of the 5 vector
    // producers keys its upsert ON `model`, so a `(model, dim)` change writes a NEW space additively
    // (never an in-place overwrite of the old space, never an inconsistent orphan). The old space is
    // reclaimed by the purge+reindex path (`purgeStaleVectors` in the bulk `index` reindex). Dropping
    // scopedCharacterId would bleed a scoped bucket's rows into the shared (group-as-character) bucket.
    uniqueIndex("chat_digests_scope_unique").on(t.chatId, t.scopedCharacterId, t.tier, t.blockIdx, t.model),
    index("chat_digests_chat_idx").on(t.chatId),
    // The scope key's SECOND column is not usable for a character-keyed delete (SQLite only uses an index
    // whose LEFTMOST column is constrained), so a character delete scanned every digest to CASCADE
    // (`fk-columns-indexed` gate).
    index("chat_digests_scoped_character_idx").on(t.scopedCharacterId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_segments — the VERBATIM chat-block lens (the raw transcript a digest hit resolves back to). Keyed
// `(chatId, blockIdx, chunkIdx)`; carries the seq-span back to canon. FK chats CASCADE; NO ownerId (D20).
//
// WHY `chunk_idx` (#172, the owner ruling behind it): a block whose verbatim transcript exceeds the EMBED
// model's window cannot be embedded whole, and it must NOT be truncated — "if we are skimping out on
// messages that's a no go since this feeds the memory system" (#165). So an oversized block becomes N
// in-budget CHUNKS, each its own row with its own honest `(seq_start, seq_end)` span, losing nothing. The
// common case is a single chunk 0 covering the whole block; the corpus's pathological case (a coding-helper
// chat's 177k–200k-char single message) becomes a handful. Consequences a reader must know: a `(chat, block)`
// is now a ROW SET, not a row — the recall span filter and discovery's block grid aggregate min/max across a
// block's chunks, and search collapses a block's chunk hits to its best-scoring one.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatSegments = sqliteTable(
  "chat_segments",
  {
    // TypeID PK (`chat_segment_…`); brand is type-only, SQL is plain TEXT.
    id: text("id").$type<ChatSegmentId>().primaryKey(),
    // The producer FK. CASCADE: a deleted chat drops its segments. The ONLY ownership link (D20).
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The block index within the chat.
    blockIdx: integer("block_idx").notNull(),
    // The chunk index WITHIN the block (0 for the overwhelming majority — one chunk covers the whole block).
    // A block too big for the embed window is chunked rather than truncated (see the header); the chunks of
    // one block are consecutive from 0, so `max(chunk_idx)+1` is the block's chunk count.
    // No DEFAULT deliberately: every inserter states the chunk it wrote, so a coupled writer that forgot
    // the column fails loudly instead of silently colliding on chunk 0.
    chunkIdx: integer("chunk_idx").notNull(),
    // The seq-span THIS CHUNK covers (the pointer back to `messages` canon). Chunks cut at message
    // boundaries wherever possible, so the span is honest per row; a single message bigger than the window
    // is split into pieces that all carry that one message's seq (the finest honest granularity there is).
    seqStart: integer("seq_start").notNull(),
    seqEnd: integer("seq_end").notNull(),
    // The verbatim transcript of the chunk (§2a) — stored + embedded; the ground truth a digest hit resolves
    // back to, returned directly so cross-chat reads never re-read N chats' canon per hit. NOT NULL.
    text: text("text").notNull(),
    // The native vector (F32_BLOB(1024)) — the verbatim lens embedding.
    embedding: vector32("embedding", { dimensions: VECTOR_DIM }).notNull(),
    // The staleness/collapse key. NOT NULL.
    contentHash: text("content_hash").notNull(),
    // Advisory-stale CSLS mean-cosine hub score (a FLOAT) — discovery-only write, never nulled by a store.
    hubScore: real("hub_score"),
    // The `(model, dim)` space tag.
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One verbatim segment per (chat, block, CHUNK, model) — the idempotent-upsert key. `chunk_idx` joined
    // the key with #172 (a block over the embed window becomes N chunks, never a truncated row). `model` is
    // in the key (PD-104) so a `(model, dim)` change writes a NEW space additively rather than overwriting
    // the old one in place; the old space is reclaimed by the purge+reindex path. Uniform with all 5 producers.
    uniqueIndex("chat_segments_chat_block_chunk_unique").on(t.chatId, t.blockIdx, t.chunkIdx, t.model),
    // #1378 item 4 — the span this chunk claims must be a real span. `seq` is a monotonic per-chat message
    // ordinal, so a negative bound names no message, and `start > end` claims a backwards range that every
    // reader resolving a hit back to canon would read as empty. `chunk_idx`/`block_idx` are reading-order
    // ordinals from 0. All four are maintained by the chunker; this is the physical floor under it.
    check("chat_segments_span_check", sql.raw("block_idx >= 0 and chunk_idx >= 0 and seq_start >= 0 and seq_end >= seq_start")),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_digest_speakers — the "which characters this digest CONTAINS" join (core/Knowledge-Cluster.md §4). Lets
// `search`/`discovery` find a character's moments ACROSS rooms regardless of the egocentric bucketing.
// Identity-keyed (digest ↔ character); composite PK (there is no TypeID brand for this join). Both FKs
// CASCADE. Re-queried by the store verb after a digest upsert (the kept id may differ from a fresh mint).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatDigestSpeakers = sqliteTable(
  "chat_digest_speakers",
  {
    digestId: text("digest_id")
      .$type<ChatDigestId>()
      .notNull()
      .references(() => chatDigests.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
  },
  (t) => [
    // Composite PK: one row per (digest, character). Re-queried after upsert by the digest scope key.
    primaryKey({ columns: [t.digestId, t.characterId] }),
    // The by-character cross-room lookup (find every digest a character appears in).
    index("chat_digest_speakers_character_idx").on(t.characterId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// document_chunks — the 5th primary vector table (producer FK: databank `documents`).
// Structurally identical to chat_segments: re-chunk/re-embed regenerates it from
// `documents.extractedText`; a document delete CASCADEs it away. NO ownerId (D20 — scope derives via
// `documents.ownerId`). The write path (an `embeddings.store` lens arm) + the search read arm land with
// DB2 proper; the table is born into the baseline now (the vector-scope-derived gate enforces the
// chokepoint from birth). `charStart`/`charEnd` are the non-overlap span offsets into extractedText
// (source highlighting + lossless-coverage assertions).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    // TypeID PK (`document_chunk_…`); brand is type-only, SQL is plain TEXT.
    id: text("id").$type<DocumentChunkId>().primaryKey(),
    // The producer FK — the ONLY ownership link (owner derives via documents.ownerId). CASCADE.
    documentId: text("document_id")
      .$type<DocumentId>()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Reading order; restore-on-retrieve (ST `index`).
    chunkIdx: integer("chunk_idx").notNull(),
    // The verbatim slice (chat_segments analogue).
    content: text("content").notNull(),
    // Offsets into documents.extractedText (exclusive end; the non-overlap span).
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    // The native vector (F32_BLOB(1024), the one Qwen3-VL space).
    embedding: vector32("embedding", { dimensions: VECTOR_DIM }).notNull(),
    // Staleness gate + dedup collapse key. NOT NULL.
    contentHash: text("content_hash").notNull(),
    // Advisory-stale hub score (a FLOAT) — discovery-only write, never nulled by a store; v1 always NULL.
    hubScore: real("hub_score"),
    // The `(model, dim)` space tag.
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The idempotent upsert key: one chunk per (document, chunkIdx, model).
    uniqueIndex("document_chunks_doc_chunk_model_unique").on(t.documentId, t.chunkIdx, t.model),
    index("document_chunks_document_idx").on(t.documentId),
    // #1378 item 4 (the document half) — `char_start`/`char_end` are offsets into
    // `documents.extractedText` with an exclusive end, so a negative offset points outside the text and
    // `start > end` is a backwards slice. Equal bounds stay legal: an empty span is representable.
    check("document_chunks_span_check", sql.raw("chunk_idx >= 0 and char_start >= 0 and char_end >= char_start")),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// image_index_skips — the image indexer's ADMISSION-FLOOR skip-log (producer: domain/embeddings indexer).
// NOT a vector table: it records assets the indexer REFUSED to caption+embed so the skip is idempotent and
// visible, never a silently-dropped asset the content-hash self-heal re-attempts every pass. An asset below
// the dimension floor (`substrate/image-admission` — a 1×1 tracking-pixel / placeholder) carries no visual
// signal, so captioning + embedding it burns VL/embed compute and poisons the retrieval + discovery
// substrate with a degenerate vector; the floor gate writes a row here instead and both admission paths
// (on-write `onAssetCreated` + the bulk `embedAssets` sweep) honor it.
//
// KEYED BY assetId ALONE (its PK), MODEL-AGNOSTIC: the verdict is about the immutable CAS bytes (an assetId
// maps to fixed bytes — a degenerate image is degenerate under every embed model), so — unlike the vector
// tables — it carries NO `(model, dim)` space tag and SURVIVES a PD-104 model change / purge+reindex (the
// asset stays below the floor). NO ownerId (D20 — scope derives via `assets.ownerId`); CASCADE on asset
// delete drops the skip with its asset. `reason` derives IMAGE_SKIP_REASONS (D34 — the same promote-to-
// contracts-so-db-can-derive rule as `image_embeddings.lens`) + a tuple-built CHECK; `width`/`height` are
// the header-parsed dimensions that failed (nullable — attribution, not a key).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const imageIndexSkips = sqliteTable(
  "image_index_skips",
  {
    // The producer FK AND the natural PK — one skip verdict per asset (the bytes are immutable per assetId,
    // so the dimension verdict is permanent). CASCADE: a deleted asset drops its skip row. The ONLY
    // ownership link (owner-scope derives via the owned asset — no ownerId column, D20/D21).
    assetId: text("asset_id")
      .$type<AssetId>()
      .primaryKey()
      .references(() => assets.id, { onDelete: "cascade" }),
    // Why the indexer refused — derives IMAGE_SKIP_REASONS (@orb/contracts/embeddings, D34). The `enum`
    // option is type-only; the CHECK below is the SQL-level guard.
    reason: text("reason", { enum: IMAGE_SKIP_REASONS }).notNull(),
    // The header-parsed dimensions that tripped the floor (attribution only, never a key). Nullable — a
    // skip whose dimensions were unparseable would carry nulls (the current floor never records that case).
    width: integer("width"),
    height: integer("height"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [
    // SQL-side enum enforcement derived from the tuple (mirrors the drizzle `{ enum }` type-side).
    check("image_index_skips_reason_check", sql.raw(`reason in (${IMAGE_SKIP_REASON_CHECK_LIST})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// embed_space_state — the LAST COMPLETE `(model[@dtype])` space per `(owner, vector scope)` (inference
// program §10-5, the `activeSpace` getter). NOT a vector table and not a cache: it is the only durable
// answer to "has this owner's corpus actually finished moving into the space their binding resolves to?"
//
// WHY IT EXISTS. A binding change re-points the READ side at the new space instantly while the corpus is
// still in the old one, so retrieval answers empty until four independent sweeps finish — and the PD-104
// purge, whose predicate is `model != <the live space>`, would meanwhile reclaim the live corpus. Rows here
// are written ONLY at a sweep's completed, non-aborted terminal, so "the space the last completed sweep
// wrote" is a fact about work that actually happened rather than about a settings row someone edited.
//
// WHY `(owner, scope)` AND NOT `(owner, task)`. A space change fans out to four sweeps with four aborts
// (`VECTOR_SCOPES`, @orb/contracts/embeddings): cards, memory, documents, images. Three of them write the
// `embed` space, so a per-task row would have to claim completion while a third of the geometry is stale.
// The getter folds scopes → task through `VECTOR_SCOPES_BY_TASK` and calls the space complete only when
// every scope of that task agrees.
//
// NO `dim` COLUMN, deliberately: the width is the DEPLOYMENT's (`EMBED_SPACE_DIMS`, the §10-1 admission
// rule — every admitted embedder is 1024), never a per-owner fact. The tag is the whole per-owner axis.
// `ownerId` IS a real column here (not a D20 violation): the row's subject IS the owner — there is no
// producer FK to derive scope from, and a per-user embedder makes completion a per-user fact.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// CHECK list derived from the canonical tuple (NOT re-spelled): `scope in ('cards', 'memory', …)`.
const VECTOR_SCOPE_CHECK_LIST = checkList(VECTOR_SCOPES);

export const embedSpaceState = sqliteTable(
  "embed_space_state",
  {
    // The owner whose corpus this is. CASCADE: a deleted user's completion state goes with their vectors.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Which half of the corpus — derives VECTOR_SCOPES (D34, as `image_embeddings.lens` derives
    // IMAGE_LENSES). The `enum` option is type-only; the CHECK below is the SQL-level guard.
    scope: text("scope", { enum: VECTOR_SCOPES }).notNull(),
    // The `(model[@dtype])` space tag (`embedSpaceOf`) the last COMPLETED sweep of this scope wrote — the
    // exact string `nearest.ts` filters on and `purgeStaleVectors` compares against.
    space: text("space").notNull(),
    completedAt: integer("completed_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One row per owner per scope — the mark verb's ON CONFLICT target (a completion OVERWRITES, it never
    // accretes: only the latest completed space is a true statement).
    primaryKey({ columns: [t.ownerId, t.scope] }),
    check("embed_space_state_scope_check", sql.raw(`scope in (${VECTOR_SCOPE_CHECK_LIST})`)),
  ],
);
