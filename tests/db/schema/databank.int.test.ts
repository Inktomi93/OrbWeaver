// .int tests for schema/databank + document_chunks (D49 #5 — the databank baseline rider). Real libSQL
// :memory: via freshDb (FK PRAGMA ON). Covers: documents round-trip + born updatedAt; unique(ownerId,
// importHash) within-user dedup; the origin CHECK (derives DOC_ORIGINS); owner CASCADE; sourceAssetId
// SET NULL; the 3 scope junctions' composite PKs + CASCADE-both-sides (document delete wipes junction +
// chunks; scope delete drops the junction, document survives); document_chunks vector round-trip +
// unique(documentId, chunkIdx, model) + document CASCADE.

import { DOC_ORIGINS } from "@orb/contracts/databank";
import type { Db } from "@orb/db";
import {
  assets,
  characterDocuments,
  characters,
  chatDocuments,
  chats,
  documentChunks,
  documents,
  globalDocuments,
  isConstraintViolation,
  users,
} from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  DocumentChunkId,
  DocumentId,
  Handle,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// `.toSatisfy` needs a `=> boolean`; `isConstraintViolation` returns the violation|undefined, so wrap it.
function isConstraintErr(err: unknown): boolean {
  return isConstraintViolation(err) !== undefined;
}

const DIM = 1024;
const MODEL = "qwen3-vl";
function rampVector(): Float32Array {
  return Float32Array.from({ length: DIM }, (_unused, i) => i / DIM);
}

test("documents.origin enum mirrors DOC_ORIGINS (derives the tuple, never re-spells)", () => {
  expect(documents.origin.enumValues).toEqual([...DOC_ORIGINS]);
});

async function seedOwner(db: Db, id: string): Promise<UserId> {
  const ownerId = castId<UserId>(id);
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>(`h-${id}`) });
  return ownerId;
}

async function seedDoc(db: Db, ownerId: UserId, id: string, hash: string): Promise<DocumentId> {
  const docId = castId<DocumentId>(id);
  await db.insert(documents).values({
    id: docId,
    ownerId,
    name: "doc.md",
    mime: "text/markdown",
    origin: "text",
    extractedText: "hello world",
    importHash: hash,
    byteSize: 11,
    extractorVersion: "none",
  });
  return docId;
}

test("documents round-trips, borns updatedAt, and enforces the origin CHECK", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_db_a");
  const id = await seedDoc(db, ownerId, "document_db_a", "hash-a");
  const rows = await db.select().from(documents).where(eq(documents.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.origin).toBe("text");
  expect(rows[0]?.updatedAt).toBeGreaterThan(0);
  expect(rows[0]?.sourceUrl).toBeNull();

  await expect(
    db.insert(documents).values({
      id: castId<DocumentId>("document_db_bad"),
      ownerId,
      name: "x",
      mime: "text/plain",
      origin: "bogus" as "text",
      extractedText: "x",
      importHash: "hash-bad",
      byteSize: 1,
      extractorVersion: "none",
    }),
  ).rejects.toSatisfy(isConstraintErr);
});

test("unique(ownerId, importHash) dedups within a user; owner CASCADE + sourceAssetId SET NULL", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_db_b");
  const assetId = castId<AssetId>("asset_db_b");
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "document",
    mime: "application/pdf",
    size: 10,
    hash: "b".repeat(64),
  });
  const docId = castId<DocumentId>("document_db_b");
  await db.insert(documents).values({
    id: docId,
    ownerId,
    sourceAssetId: assetId,
    name: "d.pdf",
    mime: "application/pdf",
    origin: "upload",
    extractedText: "x",
    importHash: "dup-hash",
    byteSize: 10,
    extractorVersion: "v1",
  });
  // Same (ownerId, importHash) → collides.
  await expect(seedDoc(db, ownerId, "document_db_b2", "dup-hash")).rejects.toSatisfy(
    isConstraintErr,
  );

  // Asset delete → sourceAssetId SET NULL, document survives.
  await db.delete(assets).where(eq(assets.id, assetId));
  const afterAsset = await db.select().from(documents).where(eq(documents.id, docId));
  expect(afterAsset[0]?.sourceAssetId).toBeNull();

  // Owner delete → document CASCADEs.
  await db.delete(users).where(eq(users.id, ownerId));
  expect(await db.select().from(documents).where(eq(documents.id, docId))).toHaveLength(0);
});

test("scope junctions: composite PK + CASCADE both sides (doc delete wipes; scope delete keeps doc)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_db_c");
  const characterId = castId<CharacterId>("character_db_c");
  await db.insert(characters).values({
    id: characterId,
    handle: "card-c",
    ownerId,
    contentHash: "h",
    name: "C",
  });
  const chatId = castId<ChatId>("chat_db_c");
  await db.insert(chats).values({ id: chatId });
  const docId = await seedDoc(db, ownerId, "document_db_c", "hash-c");

  await db.insert(globalDocuments).values({ ownerId, documentId: docId });
  await db.insert(characterDocuments).values({ characterId, documentId: docId });
  await db.insert(chatDocuments).values({ chatId, documentId: docId });

  // Composite PK: a dupe attach collides.
  await expect(
    db.insert(characterDocuments).values({ characterId, documentId: docId }),
  ).rejects.toSatisfy(isConstraintErr);

  // Scope delete (the character) → its junction row goes, the DOCUMENT survives.
  await db.delete(characters).where(eq(characters.id, characterId));
  expect(
    await db.select().from(characterDocuments).where(eq(characterDocuments.documentId, docId)),
  ).toHaveLength(0);
  expect(await db.select().from(documents).where(eq(documents.id, docId))).toHaveLength(1);

  // Document delete → the remaining junction rows CASCADE away.
  await db.delete(documents).where(eq(documents.id, docId));
  expect(
    await db.select().from(globalDocuments).where(eq(globalDocuments.documentId, docId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, docId)),
  ).toHaveLength(0);
});

test("document_chunks: vector round-trip, unique(documentId,chunkIdx,model), document CASCADE", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_db_d");
  const docId = await seedDoc(db, ownerId, "document_db_d", "hash-d");
  const vec = rampVector();
  const chunkId = castId<DocumentChunkId>("document_chunk_db_d");
  await db.insert(documentChunks).values({
    id: chunkId,
    documentId: docId,
    chunkIdx: 0,
    content: "hello",
    charStart: 0,
    charEnd: 5,
    embedding: vec,
    contentHash: "ch",
    model: MODEL,
    dim: DIM,
  });
  const rows = await db.select().from(documentChunks).where(eq(documentChunks.id, chunkId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.embedding).toBeInstanceOf(Float32Array);
  expect(rows[0]?.embedding.length).toBe(DIM);
  expect(rows[0]?.hubScore).toBeNull();

  // Same (documentId, chunkIdx, model) → the idempotent upsert key collides.
  await expect(
    db.insert(documentChunks).values({
      id: castId<DocumentChunkId>("document_chunk_db_d2"),
      documentId: docId,
      chunkIdx: 0,
      content: "hello2",
      charStart: 0,
      charEnd: 6,
      embedding: vec,
      contentHash: "ch2",
      model: MODEL,
      dim: DIM,
    }),
  ).rejects.toSatisfy(isConstraintErr);

  // Document delete → chunks CASCADE.
  await db.delete(documents).where(eq(documents.id, docId));
  expect(
    await db.select().from(documentChunks).where(eq(documentChunks.documentId, docId)),
  ).toHaveLength(0);
});
