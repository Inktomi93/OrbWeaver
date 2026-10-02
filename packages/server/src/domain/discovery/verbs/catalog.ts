// domain/discovery/verbs/catalog — distill-powered catalog analytics (owner-scoped reads; cheap SQL, no
// LLM) over character_summaries. catalog = per-facet card counts + top tags + co-tagged pairs;
// compareCharacters = a facet diff of two cards. Owner scope derives via a characters join
// (character_summaries keeps no ownerId), never a caller-supplied owner — through the ONE
// `ownedRealCharacters` belt, so the per-room synthetic group cards never count as library cards (#1467).

import type { Db } from "@orb/db";
import { characterSummaries, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DiscoveryContext } from "../context.ts";
import type { CatalogStats, CharacterComparison, ComparedCharacter, FacetCount, TagCount, TagPair } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";
import { ownedRealCharacters } from "../persistence/character-scope.ts";

const TOP_TAGS_LIMIT = 40;
const TAG_PAIRS_LIMIT = 30;
const TAG_PAIR_MIN = 2;

export function createCatalog(ctx: DiscoveryContext): Pick<DiscoveryService, "catalog" | "compareCharacters"> {
  return {
    catalog: (userId) => catalog(ctx.db, userId),
    compareCharacters: (userId, idA, idB) => compareCharacters(ctx.db, userId, idA, idB),
  };
}

async function facetCounts(db: Db, ownerId: UserId, col: typeof characterSummaries.genre | typeof characterSummaries.tone): Promise<FacetCount[]> {
  const rows = await db
    .select({ value: col, count: sql<number>`count(*)` })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .where(and(ownedRealCharacters(ownerId), isNotNull(col)))
    .groupBy(col)
    // COUNT DESC alone is not a total order: equal-count facets came back in scan order, so an unchanged
    // library rendered its facet list in a different order between two identical calls. The value is unique
    // per row here, so (count desc, value) is total.
    .orderBy(desc(sql`count(*)`), asc(col));
  return rows.flatMap((r) => (r.value === null ? [] : [{ value: r.value, count: r.count }]));
}

async function catalog(db: Db, ownerId: UserId): Promise<CatalogStats> {
  const [genres, tones] = await Promise.all([facetCounts(db, ownerId, characterSummaries.genre), facetCounts(db, ownerId, characterSummaries.tone)]);
  // json_each unnests the JSON tag arrays; lower() folds distill case-dups ("NSFW"/"nsfw").
  const topTags = await db.all<TagCount>(sql`
    SELECT lower(je.value) AS tag, COUNT(*) AS count
    FROM ${characterSummaries} cs
    JOIN ${characters} ON ${characters.id} = cs.character_id, json_each(cs.tags) je
    WHERE ${ownedRealCharacters(ownerId)}
    GROUP BY lower(je.value) ORDER BY count DESC, tag LIMIT ${TOP_TAGS_LIMIT}
  `);
  const tagPairs = await db.all<TagPair>(sql`
    SELECT lower(a.value) AS a, lower(b.value) AS b, COUNT(*) AS count
    FROM ${characterSummaries} cs
    JOIN ${characters} ON ${characters.id} = cs.character_id, json_each(cs.tags) a, json_each(cs.tags) b
    WHERE ${ownedRealCharacters(ownerId)} AND lower(a.value) < lower(b.value)
    GROUP BY lower(a.value), lower(b.value)
    HAVING COUNT(*) >= ${TAG_PAIR_MIN} ORDER BY count DESC, a, b LIMIT ${TAG_PAIRS_LIMIT}
  `);
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .where(ownedRealCharacters(ownerId));
  // totalCharacters uses the same owner scope as the distilled join, so totalDistilled ≤ totalCharacters
  // and the surface can state the denominator without a second heavier read.
  const ownedRows = await db.select({ count: sql<number>`count(*)` }).from(characters).where(ownedRealCharacters(ownerId));
  return { genres, tones, topTags, tagPairs, totalDistilled: totalRows[0]?.count ?? 0, totalCharacters: ownedRows[0]?.count ?? 0 };
}

async function comparedCard(db: Db, ownerId: UserId, characterId: CharacterId): Promise<{ card: ComparedCharacter; tags: Set<string> } | undefined> {
  const rows = await db
    .select({
      characterId: characterSummaries.characterId,
      name: characters.name,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      pitch: characterSummaries.elevatorPitch,
      tags: characterSummaries.tags,
    })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .where(and(ownedRealCharacters(ownerId), eq(characterSummaries.characterId, characterId)))
    .limit(1);
  const r = rows[0];
  if (r === undefined) {
    return;
  }
  return {
    card: {
      characterId: r.characterId,
      name: r.name,
      genre: r.genre,
      tone: r.tone,
      pitch: r.pitch,
    },
    tags: new Set(r.tags.map((t) => t.toLowerCase())),
  };
}

/** null when the ids are equal or either card isn't distilled/owned. `analyze.compareCharactersDeep`
 *  decorates this exact belt + diff via the injected `AnalyzeDeps.compareCharacters` seam (one home). */
async function compareCharacters(db: Db, ownerId: UserId, idA: CharacterId, idB: CharacterId): Promise<CharacterComparison | null> {
  if (idA === idB) {
    return null;
  }
  const [ra, rb] = await Promise.all([comparedCard(db, ownerId, idA), comparedCard(db, ownerId, idB)]);
  if (ra === undefined || rb === undefined) {
    return null;
  }
  const shared = [...ra.tags].filter((t) => rb.tags.has(t));
  const onlyA = [...ra.tags].filter((t) => !rb.tags.has(t));
  const onlyB = [...rb.tags].filter((t) => !ra.tags.has(t));
  const union = new Set([...ra.tags, ...rb.tags]).size;
  return {
    a: ra.card,
    b: rb.card,
    sameGenre: ra.card.genre !== null && ra.card.genre === rb.card.genre,
    sameTone: ra.card.tone !== null && ra.card.tone === rb.card.tone,
    sharedTags: shared,
    onlyA,
    onlyB,
    redundancy: union > 0 ? shared.length / union : 0,
  };
}
