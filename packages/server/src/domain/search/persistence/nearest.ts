// domain/search/persistence/nearest — the raw vector-scan reads (raw SQL vector_distance_cos queries;
// the row shapes live here). This is the ONE place the
// `vector_distance_cos` SQL appears in the whole codebase (invariant #1 — no domain outside search issues
// it). Queries ONLY; no business logic.
//
// The scan is EXACT (no ANN/DiskANN shadow index — db custom-types §1): an `ORDER BY vector_distance_cos
// LIMIT k` is sub-millisecond + 100% recall at this corpus scale. The query vector is bound as a raw
// little-endian F32 blob and wrapped `vector32(?)` so libSQL reads it as a vector (custom-types §1); the
// stored `embedding` column is already an `F32_BLOB`.
//
// TWO scope belts, both in the WHERE (never a post-filter — a non-owner can never receive another user's
// row, and a query never compares across embedding spaces):
//   • OWNER  — `characters.ownerId = ?` (D20: the vector row carries no ownerId; scope DERIVES from the
//     producer card). This layer NEVER reads the `users` table.
//   • SPACE  — `character_embeddings.model = ?` (the active embed model = the `(model, dim)` space tag;
//     providers.md §2b/§11 — compare ONLY within one space).

import type { ReadOnlyDb } from "@orb/db";
import { characterEmbeddings, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, ne, sql } from "drizzle-orm";

/** One card-space neighbour: the character + its raw cosine distance + the advisory hub score (for CSLS)
 *  + the rerankable `sourceText` (the card's name + description). File-local — verbs consume it by
 *  inference (no exported persistence type; `no-inline-types`). */
interface NearestCharacter {
  readonly characterId: CharacterId;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly sourceText: string;
}

interface NearestCharactersParams {
  readonly ownerId: UserId;
  /** The embedded query vector (its dim must match the column's `F32_BLOB(dim)`). */
  readonly queryVector: Float32Array;
  /** The active embed model — the space tag the scan is restricted to. */
  readonly model: string;
  /** The over-fetched pool size (`OWNER_OVERFETCH × topN`). */
  readonly limit: number;
  /** Optional self-exclusion: the seed character to omit (the `similarCharacters` "more like this" scan —
   *  a character is never its own neighbour). Omitted by `knn`/`findCharacters` (no seed). */
  readonly excludeCharacterId?: CharacterId | undefined;
}

/** Wrap a `Float32Array` as the raw little-endian blob libSQL's `vector32()` reads (custom-types §1).
 *  Exported so the digest/segment scans (`digest-rows.ts`) bind the query vector identically — one home. */
export function toVectorBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

/**
 * The top-`limit` characters in `model`'s embedding space whose card embedding is closest (cosine) to the
 * query, owner-scoped — ascending by raw distance. CSLS hub-adjust + rerank happen in the verb over these.
 */
export async function nearestCharacters(
  db: ReadOnlyDb,
  params: NearestCharactersParams,
): Promise<NearestCharacter[]> {
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
        params.excludeCharacterId === undefined
          ? undefined
          : ne(characterEmbeddings.characterId, params.excludeCharacterId),
      ),
    )
    .orderBy(distance)
    .limit(params.limit);

  return rows.map((r) => ({
    characterId: r.characterId,
    distance: r.distance,
    hubScore: r.hubScore,
    // The cross-encoder document: the card's searchable text (name + description). Trimmed so a card with
    // only whitespace description is still scorable on its name.
    sourceText: `${r.name} ${r.description ?? ""}`.trim(),
  }));
}

/** The stored card embedding + its space tag for ONE owned seed character — the `similarCharacters` seed
 *  read. OWNER-BELTED (`characters.ownerId`, D20): a foreign/unknown/unembedded seed resolves to `null`, so
 *  a stranger can never seed the scan with another tenant's vector (the neo V2-2 cross-tenant-seed lesson).
 *  The seed's OWN `model` is returned so the caller scans within that one space (a mid-swap corpus with rows
 *  from two embedders never mixes half-spaces). */
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
