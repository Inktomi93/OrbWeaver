// domain/search/persistence/nearest — the raw vector-scan reads. The ONE place vector_distance_cos SQL
// appears (queries only, no business logic). Scan is exact (no ANN index); WHERE always double-belts
// characters.ownerId (never a users read) AND character_embeddings.model (never cross-space compare).

import type { ReadOnlyDb } from "@orb/db";
import { characterEmbeddings, characters, documentChunks, documents } from "@orb/db";
import type { CharacterId, DocumentChunkId, DocumentId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

interface NearestCharacter {
  readonly characterId: CharacterId;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly sourceText: string;
}

interface NearestCharactersParams {
  readonly ownerId: UserId;
  readonly queryVector: Float32Array;
  readonly model: string;
  readonly limit: number;
  /** Self-exclusion for the "more like this" scan — a character is never its own neighbour. */
  readonly excludeCharacterId?: CharacterId | undefined;
}

/** Wrap a Float32Array as the raw little-endian blob libSQL's vector32() reads. */
export function toVectorBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

/** Top-`limit` characters in `model`'s space closest (cosine) to the query, owner-scoped, ascending distance. */
export async function nearestCharacters(db: ReadOnlyDb, params: NearestCharactersParams): Promise<NearestCharacter[]> {
  const distance = sql<number>`vector_distance_cos(${characterEmbeddings.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      characterId: characterEmbeddings.characterId,
      distance,
      hubScore: characterEmbeddings.hubScore,
      name: characters.name,
      description: characters.description,
    })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characterEmbeddings.characterId, characters.id))
    .where(
      and(
        eq(characters.ownerId, params.ownerId),
        eq(characterEmbeddings.model, params.model),
        params.excludeCharacterId === undefined ? undefined : ne(characterEmbeddings.characterId, params.excludeCharacterId),
      ),
    )
    .orderBy(distance)
    .limit(params.limit);

  return rows.map((r) => ({
    characterId: r.characterId,
    distance: r.distance,
    hubScore: r.hubScore,
    sourceText: `${r.name} ${r.description ?? ""}`.trim(),
  }));
}

interface NearestDocumentChunk {
  readonly chunkId: DocumentChunkId;
  readonly documentId: DocumentId;
  readonly documentName: string;
  readonly chunkIdx: number;
  readonly content: string;
  readonly contentHash: string;
  readonly distance: number;
  readonly hubScore: number | null;
}

interface NearestDocumentChunksParams {
  /** The scope allowlist (databank-design/05 §3.3 step 1) — applied in SQL BEFORE the cosine rank + before
   *  content_hash collapse (the vector-scope-derived belt). An empty list is a caller bug (the verb
   *  short-circuits earlier), never reached with `[]`. */
  readonly documentIds: readonly DocumentId[];
  readonly queryVector: Float32Array;
  /** The `(model, dim)` space tag — same space the chunks were embedded in (invariant 6). */
  readonly model: string;
  readonly dim: number;
  readonly limit: number;
}

/** Top-`limit` document chunks (cosine) within the scope allowlist + the active `(model, dim)` space,
 *  ascending distance. Joins `documents` for the provenance name the slot renders. The scope predicate is a
 *  WHERE (never a post-filter), the ONLY belt this table needs — ownership already resolved into the id set. */
export async function nearestDocumentChunks(db: ReadOnlyDb, params: NearestDocumentChunksParams): Promise<NearestDocumentChunk[]> {
  const distance = sql<number>`vector_distance_cos(${documentChunks.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      documentId: documentChunks.documentId,
      documentName: documents.name,
      chunkIdx: documentChunks.chunkIdx,
      content: documentChunks.content,
      contentHash: documentChunks.contentHash,
      distance,
      hubScore: documentChunks.hubScore,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(inArray(documentChunks.documentId, [...params.documentIds]), eq(documentChunks.model, params.model), eq(documentChunks.dim, params.dim)))
    .orderBy(distance)
    .limit(params.limit);

  return rows.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    documentName: r.documentName,
    chunkIdx: r.chunkIdx,
    content: r.content,
    contentHash: r.contentHash,
    distance: r.distance,
    hubScore: r.hubScore,
  }));
}

/** Stored card embedding + space tag for one owned seed character; owner-belted, a foreign/unembedded seed
 *  resolves to null. */
export async function readSeedCharacterVector(
  db: ReadOnlyDb,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<{ readonly embedding: Float32Array; readonly model: string } | null> {
  const rows = await db
    .select({ embedding: characterEmbeddings.embedding, model: characterEmbeddings.model })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characterEmbeddings.characterId, characters.id))
    .where(and(eq(characterEmbeddings.characterId, characterId), eq(characters.ownerId, ownerId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { embedding: row.embedding, model: row.model };
}
