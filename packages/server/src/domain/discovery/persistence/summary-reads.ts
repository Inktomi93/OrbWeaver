// domain/discovery/persistence/summary-reads — READ-ONLY SELECTs over discovery's OWN `character_summaries`
// rollup joined to the flat `characters` card (for the display name + owner scope). The distilled-facet read
// side the analytics verbs (archetypes / projection / catalog / compare) label their clusters + rows from.
//
// OWNER DERIVATION (D23): `character_summaries` KEEPS no ownerId — owner derives via `characterId →
// characters.ownerId`, so every read innerJoins `characters` and filters `characters.ownerId = ownerId`
// (never a caller-supplied owner — audit #1). Synthetic group characters never have a summary (distill skips
// them), so the innerJoin already excludes them.

import type { Db } from "@orb/db";
import { characterSummaries, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

// One distilled card's label material — the identity + the facets the analytics verbs tally/label from.
// File-local + non-exported (consumers infer it — the `no-inline-types` persistence-row posture).
interface CardFacetRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly tags: string[];
  readonly elevatorPitch: string | null;
}

/** Every distilled card of `ownerId` with its display name + facets (genre/tone/tags/pitch) — the label
 *  material archetypes/projection/catalog join to their card vectors by `characterId`. */
export async function readOwnedCardFacets(db: Db, ownerId: UserId): Promise<CardFacetRow[]> {
  return await db
    .select({
      characterId: characterSummaries.characterId,
      name: characters.name,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      tags: characterSummaries.tags,
      elevatorPitch: characterSummaries.elevatorPitch,
    })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .where(eq(characters.ownerId, ownerId));
}
