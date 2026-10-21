// domain/search/persistence/nearest — the raw vector-scan reads. The ONE place vector_distance_cos SQL
// appears (queries only, no business logic). Scan is exact (no ANN index); WHERE always double-belts
// characters.ownerId (never a users read) AND character_embeddings.model (never cross-space compare), and
// every scan ranks only rows as wide as its query: libSQL throws on a cross-width distance, and widths
// follow the embedder, so one table can hold several.

import type { ReadOnlyDb } from "@orb/db";
import { characterEmbeddings, characters, documentChunks, documents, embedGenerations, embedSpaceState } from "@orb/db";
import type { CharacterId, DocumentChunkId, DocumentId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DocumentSearchParams } from "../contract/params.ts";
import type { ResolveActiveDocumentScopeOp } from "../contract/service.ts";

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
  readonly generationId?: EmbedGenerationId | undefined;
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
        eq(characterEmbeddings.dim, params.queryVector.length),
        params.generationId === undefined ? undefined : eq(characterEmbeddings.generationId, params.generationId),
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
  readonly scope: DocumentSearchParams["scope"];
  /** The preflight candidates only narrow the current databank predicate; they never grant read authority. */
  readonly documentIds: readonly DocumentId[];
  readonly queryVector: Float32Array;
  /** The space tag — same space the chunks were embedded in (invariant 6). */
  readonly model: string;
  readonly generationId?: EmbedGenerationId | undefined;
  readonly generationFingerprint?: string | undefined;
  readonly limit: number;
}

/** Rank only chunks still admitted by databank's current scope, intersected with preflight candidates. */
export async function nearestDocumentChunks(
  db: ReadOnlyDb,
  resolveActiveDocumentScope: ResolveActiveDocumentScopeOp,
  params: NearestDocumentChunksParams,
): Promise<NearestDocumentChunk[]> {
  const currentScope = await resolveActiveDocumentScope(params.scope);
  const distance = sql<number>`vector_distance_cos(${documentChunks.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  let generationCondition = params.generationId === undefined ? undefined : eq(documentChunks.generationId, params.generationId);
  if (params.generationFingerprint !== undefined) {
    generationCondition = and(eq(embedGenerations.fingerprint, params.generationFingerprint), eq(embedSpaceState.activeGenerationId, embedGenerations.id));
  }
  // databank's compose-injected resolveActiveDocumentScope supplies the independent current WHERE after query embedding; its shared junction subqueries preserve D85 room credits, and personal scope binds documents.ownerId. The gate cannot inspect this injected SQL. Ends if currentScope leaves the WHERE or the scope operation no longer comes from databank.
  // the generation is pinned to documents.ownerId, whose independent current databank WHERE admits the row before ranking; room credits may belong to another present member, not the query funder. Ends if currentScope or the owner match is dropped.
  // the active documents space is pinned to the same admitted document owner through embedGenerations.ownerId. Ends if currentScope or either owner match is dropped.
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
    .leftJoin(embedGenerations, and(eq(documentChunks.generationId, embedGenerations.id), eq(documents.ownerId, embedGenerations.ownerId)))
    .leftJoin(
      embedSpaceState,
      and(
        eq(embedSpaceState.ownerId, embedGenerations.ownerId),
        eq(embedSpaceState.scope, "documents"),
        eq(embedSpaceState.activeGenerationId, embedGenerations.id),
      ),
    )
    .where(
      and(
        currentScope,
        inArray(documentChunks.documentId, [...params.documentIds]),
        eq(documentChunks.model, params.model),
        generationCondition,
        eq(documentChunks.dim, params.queryVector.length),
      ),
    )
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
  generationId?: EmbedGenerationId,
): Promise<{ readonly embedding: Float32Array; readonly model: string } | null> {
  const rows = await db
    .select({ embedding: characterEmbeddings.embedding, model: characterEmbeddings.model })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characterEmbeddings.characterId, characters.id))
    .where(
      and(
        eq(characterEmbeddings.characterId, characterId),
        eq(characters.ownerId, ownerId),
        generationId === undefined ? undefined : eq(characterEmbeddings.generationId, generationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { embedding: row.embedding, model: row.model };
}
