// domain/discovery/verbs/browse — the distill read-half: the filterable distilled catalog
// (browseCharacters) + the facet dropdowns (characterFacets). Content-only, no engagement/usage counts.
// Owner scope derives via a characters join (character_summaries keeps no ownerId), never a caller-supplied owner.

import type { Db } from "@orb/db";
import { assets, characterSummaries, characters } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DiscoveryContext } from "../context.ts";
import type { BrowseFilter } from "../contract/params.ts";
import type { BrowseCharacter, CharacterFacets, FacetCount } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";

// The page size when the caller names none. A library past this is TRUNCATED silently — deliberate (the row
// set is a browse page, not a count), and the reason the catalog's `totalDistilled` is a separate read: a
// surface that needs "N of M" takes M from `catalog`, never from this array's length.
const DEFAULT_BROWSE_LIMIT = 200;

export function createBrowse(ctx: DiscoveryContext): Pick<DiscoveryService, "browseCharacters" | "characterFacets"> {
  return {
    browseCharacters: (userId, filter) => browseCharacters(ctx.db, userId, filter),
    characterFacets: (userId) => characterFacets(ctx.db, userId),
  };
}

async function browseCharacters(db: Db, ownerId: UserId, filter: BrowseFilter = {}): Promise<BrowseCharacter[]> {
  const conds = [eq(characters.ownerId, ownerId), eq(characters.synthetic, false)];
  if (filter.genre !== undefined) {
    conds.push(eq(characterSummaries.genre, filter.genre));
  }
  if (filter.tone !== undefined) {
    conds.push(eq(characterSummaries.tone, filter.tone));
  }
  if (filter.tag !== undefined) {
    // json_each membership is an exact-string test (never a fragile LIKE %"tag"% that would hit JSON quotes/commas).
    const tag = filter.tag.toLowerCase();
    conds.push(sql`EXISTS (SELECT 1 FROM json_each(${characterSummaries.tags}) WHERE lower(value) = ${tag})`);
  }
  const q = filter.q?.trim().toLowerCase();
  if (q !== undefined && q.length > 0) {
    const like = `%${q}%`;
    conds.push(
      sql`(lower(${characters.name}) LIKE ${like} OR lower(${characterSummaries.elevatorPitch}) LIKE ${like} OR EXISTS (SELECT 1 FROM json_each(${characterSummaries.tags}) WHERE lower(value) LIKE ${like}))`,
    );
  }
  const orderBy = (filter.sort ?? "recent") === "name" ? asc(characters.name) : desc(characters.createdAt);

  const rows = await db
    .select({
      characterId: characterSummaries.characterId,
      name: characters.name,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      setting: characterSummaries.setting,
      tags: characterSummaries.tags,
      elevatorPitch: characterSummaries.elevatorPitch,
      avatarHash: assets.hash,
      createdAt: characters.createdAt,
    })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(and(...conds))
    .orderBy(orderBy)
    .limit(filter.limit ?? DEFAULT_BROWSE_LIMIT);

  return rows;
}

async function characterFacets(db: Db, ownerId: UserId): Promise<CharacterFacets> {
  const facet = async (col: typeof characterSummaries.genre | typeof characterSummaries.tone): Promise<FacetCount[]> => {
    const rows = await db
      .select({ value: col, count: sql<number>`count(*)` })
      .from(characterSummaries)
      .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
      .where(and(eq(characters.ownerId, ownerId), isNotNull(col)))
      .groupBy(col)
      .orderBy(desc(sql`count(*)`));
    return rows.flatMap((r) => (r.value === null ? [] : [{ value: r.value, count: r.count }]));
  };
  const [genres, tones] = await Promise.all([facet(characterSummaries.genre), facet(characterSummaries.tone)]);
  return { genres, tones };
}
