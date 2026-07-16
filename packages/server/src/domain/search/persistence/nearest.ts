// domain/search/persistence/nearest — the raw vector-scan reads. The ONE place vector_distance_cos SQL
// appears (queries only, no business logic). Scan is exact (no ANN index); WHERE always double-belts
// characters.ownerId (never a users read) AND character_embeddings.model (never cross-space compare).

import type { ReadOnlyDb } from "@orb/db";
import { characterEmbeddings, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, ne, sql } from "drizzle-orm";

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
