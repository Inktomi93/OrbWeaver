// schema/databank — the databank source-document canon + its scope junctions (producer:
// domain/databank, D49 #5). Tables born WHOLE into the
// `0000_baseline` (pre-launch squash rule): documents · global_documents · character_documents ·
// chat_documents. The 5th vector table `document_chunks` is the DERIVED layer and lives with the other
// vector tables in `schema/embeddings.ts` (the vector-substrate home + the D20 chokepoint).
//
// THE LOAD-BEARING DECISIONS:
//   • `documents` is TOP-LEVEL OWNED CANON (D23 KEEP): `ownerId` STAMPED, CASCADE. `extractedText` IS
//     the canon (binary → text, re-runnable); `sourceAssetId` (the original bytes in the per-user CAS,
//     D21) is SET NULL — NULL for origin 'text' (nothing to re-extract).
//   • UNIQUE(ownerId, importHash): within-user re-upload dedup; the (ownerId, …) prefix also serves
//     every list-by-owner query — no second index. `importHash` = sha-256 of the SOURCE BYTES (for
//     origin 'text', sha-256 of extractedText — same dedup semantics).
//   • Derive-don't-stamp: NO ingestState/status column (ingest progress is derived from chunk counts +
//     an active `databank-ingest` workload row); NO chunk-params column (the derived layer is fully
//     re-runnable).
//   • The 3 junctions are per-type FK, two-column PK, CASCADE both sides, NO ownerId stamp (D23 — owner
//     derives via the documentId FK; for global_documents the ownerId column IS the scope subject, not a
//     stamp). `global` → single-owned personal bank (D21, not a global tier); `character` → per-type FK
//     (D23); `chat` → membership-scoped (D18). Each carries a reverse `*_document_idx` for the
//     document→scopes lookup (listAttachments). All three ship in v1 even where the verbs fast-follow —
//     the shape is decided; a second migration for a known table is pure churn (the rpg precedent).

import { DOC_ORIGINS } from "@orb/contracts/databank";
import type { AssetId, CharacterId, ChatId, DocumentId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { assets } from "./assets.ts";
import { characters } from "./character.ts";
import { chats } from "./chat.ts";
import { users } from "./users.ts";

// CHECK list derived from the canonical tuple (NOT re-spelled) — static DDL fragment, the assets.ts /
// workloads.ts pattern. The `documents.origin` column carries BOTH the drizzle `{ enum }` (type-side) AND
// this SQL CHECK so the axis is SQL-enforced too (born-compliant; every sibling enum column does this).
const DOC_ORIGIN_CHECK_LIST = checkList(DOC_ORIGINS);

export const documents = sqliteTable(
  "documents",
  {
    // TypeID PK (`document_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<DocumentId>().primaryKey(),
    // Top-level owned canon (D23 KEEP) — STAMPED ownerId, CASCADE.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Original uploaded bytes live in the per-user CAS (D21); NULL for origin 'text' (nothing to
    // re-extract). SET NULL — a purged blob degrades the doc, never blocks it.
    sourceAssetId: text("source_asset_id")
      .$type<AssetId>()
      .references(() => assets.id, { onDelete: "set null" }),
    // Display filename / scrape title; mutable metadata (rename verb).
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    // 'upload'|'web'|'youtube'|'wiki'|'text' — derives DOC_ORIGINS (no re-spell).
    origin: text("origin", { enum: DOC_ORIGINS }).notNull(),
    // Scrape provenance; NULL for upload/text.
    sourceUrl: text("source_url"),
    // THE CANON (binary → text, re-runnable).
    extractedText: text("extracted_text").notNull(),
    // sha-256 of the SOURCE BYTES (re-upload dedup); for origin 'text', sha-256 of extractedText.
    importHash: text("import_hash").notNull(),
    // source-byte size; for 'text', extractedText UTF-8 length.
    byteSize: integer("byte_size").notNull(),
    // EXTRACTOR_VERSION at extract time (the re-extract-on-upgrade selection predicate); "none" for
    // origin 'text' (no extractor ran).
    extractorVersion: text("extractor_version").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // Bumped by rename + re-extract (a doc whose canon can be rewritten in place needs a visible write
    // timestamp; createdAt alone lies after the first re-extract).
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("documents_owner_hash_unique").on(t.ownerId, t.importHash),
    // The source-blob FK's SET-NULL parent scan (an asset delete / CAS GC walks this table). The
    // (ownerId, importHash) unique cannot serve an assetId-only predicate (`fk-columns-indexed` gate).
    index("documents_source_asset_idx").on(t.sourceAssetId),
    check("documents_origin_check", sql.raw(`origin in (${DOC_ORIGIN_CHECK_LIST})`)),
  ],
);

// ── the 3 scope junctions (per-type FK, two-column PK, CASCADE both sides, NO ownerId stamp) ─────────

export const globalDocuments = sqliteTable(
  "global_documents",
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
  (t) => [primaryKey({ columns: [t.ownerId, t.documentId] }), index("global_documents_document_idx").on(t.documentId)],
);

export const characterDocuments = sqliteTable(
  "character_documents",
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
  (t) => [primaryKey({ columns: [t.characterId, t.documentId] }), index("character_documents_document_idx").on(t.documentId)],
);

export const chatDocuments = sqliteTable(
  "chat_documents",
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
  (t) => [primaryKey({ columns: [t.chatId, t.documentId] }), index("chat_documents_document_idx").on(t.documentId)],
);
