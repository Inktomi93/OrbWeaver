// domain/discovery/cooccurrence/retrieve — the read side of the cooccurrence subsystem (cheap rollup lookups
// for the live tRPC paths; the heavy pass that POPULATES the tables is generate.ts, workload-driven). Was
// neo-tavern `corpus/cooccurrence/retrieve.ts` (adapted to orb's schema: `keyword_cooccurrence` stores NO
// sampled `characterIds`, `character_keyword_profiles` has NO ownerId — owner DERIVES via `characterId →
// characters.ownerId`, D23). `ownerId` is ALWAYS the resolved principal id (audit #1).

import type { Db } from "@orb/db";
import { characterKeywordProfiles, characters, keywordCooccurrence } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import type { TopKeywordsOptions } from "../contract/params.ts";
import type { KeywordCount } from "../contract/results.ts";
import { normalizeKeyword } from "./utils.ts";

const DEFAULT_TOP_LIMIT = 50;
const DEFAULT_TOP_MIN_COUNT = 2;
const DEFAULT_COOCCUR_LIMIT = 25;
const DEFAULT_CHAR_LIMIT = 30;

/** The owner's most-used distilled scene keywords (summed over their character profiles), count-descending.
 *  `character_keyword_profiles` has no ownerId — owner derives via the `characters` join (D23). */
export async function topKeywords(db: Db, ownerId: UserId, opts: TopKeywordsOptions = {}): Promise<KeywordCount[]> {
  const limit = opts.limit ?? DEFAULT_TOP_LIMIT;
  const minCount = opts.minCount ?? DEFAULT_TOP_MIN_COUNT;
  const summed = sql<number>`sum(${characterKeywordProfiles.count})`;
  return await db
    .select({ keyword: characterKeywordProfiles.keyword, count: summed })
    .from(characterKeywordProfiles)
    .innerJoin(characters, eq(characters.id, characterKeywordProfiles.characterId))
    .where(eq(characters.ownerId, ownerId))
    .groupBy(characterKeywordProfiles.keyword)
    .having(gte(summed, minCount))
    .orderBy(desc(summed))
    .limit(limit);
}

/** The keywords that co-occur with `keyword` in the owner's scenes, count-descending. `keyword_cooccurrence`
 *  KEEPS ownerId, so the scope is a direct filter; the pair is canonical A-before-B, so the "other" side is
 *  whichever column isn't the query keyword. */
export async function cooccurringKeywords(db: Db, ownerId: UserId, keyword: string, limit = DEFAULT_COOCCUR_LIMIT): Promise<KeywordCount[]> {
  const norm = normalizeKeyword(keyword) ?? keyword.trim().toLowerCase();
  const other = sql<string>`CASE WHEN ${keywordCooccurrence.keywordA} = ${norm} THEN ${keywordCooccurrence.keywordB} ELSE ${keywordCooccurrence.keywordA} END`;
  return await db
    .select({ keyword: other, count: keywordCooccurrence.count })
    .from(keywordCooccurrence)
    .where(and(eq(keywordCooccurrence.ownerId, ownerId), or(eq(keywordCooccurrence.keywordA, norm), eq(keywordCooccurrence.keywordB, norm))))
    .orderBy(desc(keywordCooccurrence.count))
    .limit(limit);
}

/** One character's keyword profile (the keywords its scenes anchor on), count-descending. Owner belt via the
 *  `characters` join (`character_keyword_profiles` has no ownerId — a foreign character yields no rows). */
export async function characterKeywords(db: Db, ownerId: UserId, characterId: CharacterId, limit = DEFAULT_CHAR_LIMIT): Promise<KeywordCount[]> {
  return await db
    .select({ keyword: characterKeywordProfiles.keyword, count: characterKeywordProfiles.count })
    .from(characterKeywordProfiles)
    .innerJoin(characters, eq(characters.id, characterKeywordProfiles.characterId))
    .where(and(eq(characters.ownerId, ownerId), eq(characterKeywordProfiles.characterId, characterId)))
    .orderBy(desc(characterKeywordProfiles.count))
    .limit(limit);
}
