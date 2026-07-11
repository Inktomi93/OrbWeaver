// domain/discovery/verbs/browse — the PD-40 distill READ-half: the filterable distilled catalog
// (`browseCharacters`) + the facet dropdowns (`characterFacets`). CONTENT-only (Knowledge-Cluster fence):
// the distilled facets + card identity (name/avatar), NO engagement/usage counts (most-played is a stats
// concern, composed client-side). Owner scope derives via `characterId → characters.ownerId`
// (character_summaries KEEPS no ownerId, D23) — a JOIN, never a caller-supplied owner (audit #1). `ownerId`
// is ALWAYS the resolved principal id (branded at the tRPC seam).

import type { Db } from "@orb/db";
import { assets, characterSummaries, characters } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { BrowseFilter } from "../contract/params";
import type { BrowseCharacter, CharacterFacets, FacetCount } from "../contract/results";
import type { DiscoveryContext, DiscoveryService } from "../contract/service";

// The default browse page size (a filter with no `limit` returns at most this many rows).
const DEFAULT_BROWSE_LIMIT = 200;

/** Bind the browse reads over the DI bundle (the verb-naming factory the service composes). */
export function createBrowse(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "browseCharacters" | "characterFacets"> {
  return {
    browseCharacters: (userId, filter) => browseCharacters(ctx.db, userId, filter),
    characterFacets: (userId) => characterFacets(ctx.db, userId),
  };
}

/**
 * The owner's filterable distilled catalog — distillation facets + card identity (name + avatar), filtered /
 * sorted / paged in SQL. Standalone `(db, ownerId, filter?)` so the factory + tests call it directly.
 * `synthetic` cards never have a summary (distill skips them), so the innerJoin already excludes them.
 */
export async function browseCharacters(
  db: Db,
  ownerId: UserId,
  filter: BrowseFilter = {},
): Promise<BrowseCharacter[]> {
  const conds = [eq(characters.ownerId, ownerId), eq(characters.synthetic, false)];
  if (filter.genre !== undefined) {
    conds.push(eq(characterSummaries.genre, filter.genre));
  }
  if (filter.tone !== undefined) {
    conds.push(eq(characterSummaries.tone, filter.tone));
  }
  if (filter.tag !== undefined) {
    // `tags` is a JSON string[] column — json_each membership is an exact-string test (never a fragile
    // `LIKE %"tag"%` that would hit the JSON quotes/commas); lower() keeps the case-insensitive contract.
    const tag = filter.tag.toLowerCase();
    conds.push(
      sql`EXISTS (SELECT 1 FROM json_each(${characterSummaries.tags}) WHERE lower(value) = ${tag})`,
    );
  }
  const q = filter.q?.trim().toLowerCase();
  if (q !== undefined && q.length > 0) {
    const like = `%${q}%`;
    conds.push(
      sql`(lower(${characters.name}) LIKE ${like} OR lower(${characterSummaries.elevatorPitch}) LIKE ${like} OR EXISTS (SELECT 1 FROM json_each(${characterSummaries.tags}) WHERE lower(value) LIKE ${like}))`,
    );
  }
  const orderBy =
    (filter.sort ?? "recent") === "name" ? asc(characters.name) : desc(characters.createdAt);

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

  return rows.map((r) => ({ ...r, tags: r.tags ?? [] }));
}

/** The distinct genres + tones in the owner's distilled corpus, each with its card count (descending) — the
 *  browse filter dropdowns. Owner scope derives via the `characters` join (character_summaries has no ownerId). */
export async function characterFacets(db: Db, ownerId: UserId): Promise<CharacterFacets> {
  const facet = async (
    col: typeof characterSummaries.genre | typeof characterSummaries.tone,
  ): Promise<FacetCount[]> => {
    const rows = await db
      .select({ value: col, count: sql<number>`count(*)` })
      .from(characterSummaries)
      .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
      .where(and(eq(characters.ownerId, ownerId), isNotNull(col)))
      .groupBy(col)
      .orderBy(desc(sql`count(*)`));
    return rows.flatMap((r) => (r.value === null ? [] : [{ value: r.value, count: r.count }]));
  };
  const [genres, tones] = await Promise.all([
    facet(characterSummaries.genre),
    facet(characterSummaries.tone),
  ]);
  return { genres, tones };
}
