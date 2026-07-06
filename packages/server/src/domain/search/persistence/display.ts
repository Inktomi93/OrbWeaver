// domain/search/persistence/display — the display-enrichment JOINs. Queries ONLY (returns rows; the
// verb keys them).
//
// `resolveCharacterDisplay` enriches character-card hits with the distilled facets `discovery` writes to
// `character_summaries` (genre / tone / elevatorPitch — D28: read off the FLAT character row's summary,
// no version join) + the avatar CAS hash. Reading `discovery`'s output table via `@orb/db` is a DOWNWARD
// schema dep (allowed — reading discovery's output TABLE, not its module); it is NOT a sideways domain import.
// Owner-scoped in the WHERE (the hits are already owner-scoped, but the enrichment re-asserts it so a
// crafted id list can never read across owners). Never reads the `users` table.

import type { ReadOnlyDb } from "@orb/db";
import { assets, characterSummaries, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";

/** One display row — the facets + avatar for a single owned character. File-local — the verb consumes it
 *  by inference and builds the id→row lookup (no exported persistence type; `no-inline-types`). */
interface CharacterDisplayRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
}

/**
 * Resolve the display facets for a set of owned characters. Characters not returned (deleted between scan
 * and enrich, or not the caller's) are simply absent — the verb skips them. `character_summaries` is
 * LEFT-joined: a card with no computed summary yet yields `null` facets.
 */
export async function resolveCharacterDisplay(
  db: ReadOnlyDb,
  ownerId: UserId,
  characterIds: readonly CharacterId[],
): Promise<CharacterDisplayRow[]> {
  if (characterIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      elevatorPitch: characterSummaries.elevatorPitch,
    })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .leftJoin(characterSummaries, eq(characterSummaries.characterId, characters.id))
    .where(and(eq(characters.ownerId, ownerId), inArray(characters.id, [...characterIds])));
  return rows;
}
