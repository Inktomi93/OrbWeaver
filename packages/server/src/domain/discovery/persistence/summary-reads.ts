// domain/discovery/persistence/summary-reads — read-only SELECTs over discovery's own character_summaries
// rollup joined to the flat characters card (display name + owner scope). character_summaries keeps no
// ownerId, so every read innerJoins characters and filters on characters.ownerId, never a caller-supplied owner.

import type { Db } from "@orb/db";
import { characterSummaries, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

interface CardFacetRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly tags: string[];
  readonly elevatorPitch: string | null;
}

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
