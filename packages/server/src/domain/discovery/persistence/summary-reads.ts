// domain/discovery/persistence/summary-reads — read-only SELECTs over discovery's own character_summaries
// rollup joined to the flat characters card (display name + owner scope). character_summaries keeps no
// ownerId, so every read innerJoins characters and filters on characters.ownerId, never a caller-supplied owner.
// The current avatar's CAS hash rides along on a LEFT join to assets — one string off a join this read already
// performs, so a display slice built from these rows can draw a face without a second owner-scoped read.
//
// SCOPE, AND WHAT THIS READ IS NOT (issue #154). Rooted at `character_summaries`, this returns the DISTILLED
// subset of the owner's library and nothing else — which is right for a facet question and wrong for an
// identity one. The embedding-driven views (archetypes · projection · similarity graph) cluster every INDEXED
// card, so they resolve name + face from `card-reads.readOwnedCardDisplay` and come here only for
// genre/tone/tags. Do not re-merge the two: a card is indexed on import and distilled much later, and reading
// identity through this row is exactly how 327 imported characters all rendered "Unknown".

import type { Db } from "@orb/db";
import { assets, characterSummaries, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";

interface CardFacetRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly tags: string[];
  readonly elevatorPitch: string | null;
  /** The refinery card-quality signal, read straight out of the `characters.refinery` JSON blob — one
   *  scalar off a join this read already performs. `null` covers both an unstamped card and a stored
   *  `"score": null`; here they are the same fact ("not scored"). The blob's OWNER is character (one
   *  writer, F6) — this is a read, and it takes the SQL path for the same reason the score sorts do: the
   *  column parser is a character-domain seam a sibling domain may not import. */
  readonly refineryScore: number | null;
  /** The CAS hash of the card's CURRENT avatar, or `null` when it has none — the face that goes beside the
   *  display name this row already resolves. LEFT-joined on purpose: an inner join would silently delete
   *  every faceless card from the archetype clusters, the projection and the similarity graph. */
  readonly avatarHash: string | null;
}

/** The score projection, spelled once for both reads below. */
const refineryScoreExpr = sql<number | null>`json_extract(${characters.refinery}, '$.score')`;

export async function readOwnedCardFacets(db: Db, ownerId: UserId): Promise<CardFacetRow[]> {
  return await db
    .select({
      characterId: characterSummaries.characterId,
      name: characters.name,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      tags: characterSummaries.tags,
      elevatorPitch: characterSummaries.elevatorPitch,
      refineryScore: refineryScoreExpr,
      avatarHash: assets.hash,
    })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(eq(characters.ownerId, ownerId));
}

/** ONE owned/distilled card's facets — the owner belt for `askCard`/`characterDossier` (`undefined` when the
 *  character isn't owned by `ownerId` or has no `character_summaries` row). Owner scope via `characters.ownerId`. */
export async function readOwnedCardFacet(db: Db, ownerId: UserId, characterId: CharacterId): Promise<CardFacetRow | undefined> {
  const rows = await db
    .select({
      characterId: characterSummaries.characterId,
      name: characters.name,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      tags: characterSummaries.tags,
      elevatorPitch: characterSummaries.elevatorPitch,
      refineryScore: refineryScoreExpr,
      avatarHash: assets.hash,
    })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(and(eq(characters.ownerId, ownerId), eq(characterSummaries.characterId, characterId)))
    .limit(1);
  return rows[0];
}
