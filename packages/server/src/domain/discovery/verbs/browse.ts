// domain/discovery/verbs/browse — owned character pages plus distilled facet dropdowns.
// Content-only: no engagement or usage counts.
// Owner scope derives via a characters join (character_summaries keeps no ownerId), never a caller-supplied owner.

import type { BrowseSort } from "@orb/contracts/discovery";
import { BROWSE_DEFAULT_LIMIT } from "@orb/contracts/discovery";
import type { Db } from "@orb/db";
import { assets, characterSummaries, characters } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, gt, isNotNull, lt, or, sql } from "drizzle-orm";
import type { DiscoveryContext } from "../context.ts";
import type { BrowseCursor, BrowseFilter } from "../contract/params.ts";
import type { BrowseCharacter, BrowseCharactersPage, CharacterFacets, FacetCount } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";

// KEYSET, NOT A CEILING (A8, side-eye corpus re-pass 2026-08-19). This verb used to answer one array capped
// at 200 and call the truncation deliberate, on the reasoning that "the row set is a browse page, not a
// count" — which is true and was never the defect. The defect is that a page with no CURSOR is a page with
// no NEXT: the corpus pane printed `catalog.totalDistilled` (313) over a list that ended at 200 rows with no
// load-more, so 113 owned characters were unreachable from the only surface that browses them. The census
// stays a separate read for the same reason it always was — `items.length` is "how many are loaded" and the
// header states "how many there are" — it is just no longer the only number that is true.

export function createBrowse(ctx: DiscoveryContext): Pick<DiscoveryService, "browseCharacters" | "characterFacets"> {
  return {
    browseCharacters: (userId, filter) => browseCharacters(ctx.db, userId, filter),
    characterFacets: (userId) => characterFacets(ctx.db, userId),
  };
}

/** The keyset predicate for "everything strictly after the previous page's last row", in the requested
 *  ordering. The tie-break on `characterId` is what makes the boundary total: `createdAt` and `name` both
 *  repeat, and a keyset on a non-unique column alone either skips or duplicates rows at the seam. */
function afterCursor(cursor: BrowseCursor): ReturnType<typeof or> {
  if (cursor.sort === "name") {
    return or(gt(characters.name, cursor.name), and(eq(characters.name, cursor.name), gt(characters.id, cursor.characterId)));
  }
  return or(lt(characters.createdAt, cursor.createdAt), and(eq(characters.createdAt, cursor.createdAt), gt(characters.id, cursor.characterId)));
}

/** The boundary of the page just served — `null` at the tail, where a short page proves there is no next. */
function nextCursorFor(sort: BrowseSort, rows: readonly BrowseCharacter[], pageSize: number): BrowseCursor | null {
  const last = rows.at(-1);
  if (last === undefined || rows.length < pageSize) {
    return null;
  }
  return sort === "name"
    ? { sort: "name", name: last.name, characterId: last.characterId }
    : { sort: "recent", createdAt: last.createdAt, characterId: last.characterId };
}

async function browseCharacters(db: Db, ownerId: UserId, filter: BrowseFilter = {}): Promise<BrowseCharactersPage> {
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
  const sort = filter.sort ?? "recent";
  // The COUNT runs over the filter alone — the cursor windows the page, it does not narrow the scope, and a
  // census that shrank as you paged would be a worse number than the one A8 replaced.
  const scope = and(...conds);
  const pageSize = filter.limit ?? BROWSE_DEFAULT_LIMIT;
  if (filter.cursor !== undefined && filter.cursor.sort !== sort) {
    // A cursor minted under the other ordering describes a boundary this keyset cannot use; applying it
    // anyway silently drops or repeats rows. Refusing by ignoring the page (empty, no next) would be a
    // silent lie too, so the caller's contract is: re-key the query when the sort changes (which is what
    // `createCollectionSurface` does — the sort is part of the query key).
    throw new Error(`browseCharacters cursor sort '${filter.cursor.sort}' does not match the requested sort '${sort}'`);
  }
  const page = filter.cursor === undefined ? scope : and(scope, afterCursor(filter.cursor));
  // Both keysets end on the same tie-break column, so the ORDER BY has to carry it too — an ordering the
  // cursor predicate does not share is a keyset that skips rows at every repeated name/timestamp.
  const orderBy = sort === "name" ? [asc(characters.name), asc(characters.id)] : [desc(characters.createdAt), asc(characters.id)];

  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      setting: characterSummaries.setting,
      tags: characterSummaries.tags,
      elevatorPitch: characterSummaries.elevatorPitch,
      avatarHash: assets.hash,
      createdAt: characters.createdAt,
    })
    .from(characters)
    .leftJoin(characterSummaries, eq(characters.id, characterSummaries.characterId))
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(page)
    .orderBy(...orderBy)
    .limit(pageSize);
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(characters)
    .leftJoin(characterSummaries, eq(characters.id, characterSummaries.characterId))
    .where(scope);

  const items = rows.map((row) => ({ ...row, tags: row.tags ?? [] }));
  return { items, nextCursor: nextCursorFor(sort, items, pageSize), totalCount: totalRows[0]?.count ?? 0 };
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
