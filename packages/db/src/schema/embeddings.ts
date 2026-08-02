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

import { IMAGE_LENSES } from "@orb/contracts/embeddings";
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
import { vector32 } from "../custom-types";
import { assets } from "./assets";
import { characters } from "./character";
import { chats } from "./chat";
import { documents } from "./databank";

// The one 1024-dim space (Qwen3-VL, text↔image cosine-comparable — core/Knowledge-Cluster.md §1). Every
// `embedding` column is F32_BLOB(1024); the row's `dim` column records it for the `(model, dim)` space tag.
const VECTOR_DIM = 1024;

// CHECK list derived from the canonical tuple (NOT re-spelled): `lens in ('image-raw', 'image-captioned')`.
// A CHECK is static DDL and cannot carry bound parameters, so it is built as a raw fragment (assets.ts /
// workloads.ts pattern).
const IMAGE_LENS_CHECK_LIST = IMAGE_LENSES.map((lens) => `'${lens}'`).join(", ");

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
    // The generated caption (only for the `image-captioned` lens) + its provenance sidecar. Nullable —
    // the `image-raw` lens carries neither.
    caption: text("caption"),
    captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),
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
// `(chatId, blockIdx)`; carries the seq-span back to canon. FK chats CASCADE; NO ownerId (D20).
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
    // The seq-span this verbatim block covers (the pointer back to `messages` canon).
    seqStart: integer("seq_start").notNull(),
    seqEnd: integer("seq_end").notNull(),
    // The verbatim transcript of the block (§2a) — stored + embedded; the ground truth a digest hit resolves
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
    // One verbatim segment per (chat, block, model) — the idempotent-upsert key. `model` is in the key
    // (PD-104) so a `(model, dim)` change writes a NEW space additively rather than overwriting the old
    // one in place; the old space is reclaimed by the purge+reindex path. Uniform with all 5 producers.
    uniqueIndex("chat_segments_chat_block_unique").on(t.chatId, t.blockIdx, t.model),
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
// document_chunks — the 5th primary vector table (producer FK: databank `documents`; databank-design/02
// §2). Structurally identical to chat_segments: re-chunk/re-embed regenerates it from
// `documents.extractedText`; a document delete CASCADEs it away. NO ownerId (D20 — scope derives via
// `documents.ownerId`). The write path (an `embeddings.store` lens arm) + the search read arm land with
// DB2 proper; the table is born into the baseline now (the vector-scope-derived gate enforces the
// chokepoint from birth). `charStart`/`charEnd` are the non-overlap span offsets into extractedText
// (source highlighting + lossless-coverage assertions — databank-design/02 §2.1).
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
  ],
);
