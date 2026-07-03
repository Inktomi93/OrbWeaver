// domain/discovery/duplicates/retrieve — the owner-scoped near-duplicate CHARACTER read. Joins
// `duplicate_character_pairs` to `characters` on BOTH sides (the names for display + the owner scope belt:
// a pair is within ONE owner's library, so filtering side A's owner = the principal is sufficient and the
// join NEVER reads the `users` table). CSLS-ranked (highest first). No `similarCharacters` here — top-k
// "more like this character" is `search`'s; this is the recorded-pairs read.
//
// `ownerId` is ALWAYS the resolved principal id, never caller input (audit #1) — the verb signature takes a
// branded `UserId` the tRPC seam supplies.

import type { Db } from "@orb/db";
import { characters, duplicateCharacterPairs } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { aliasedTable, and, desc, eq, gte } from "drizzle-orm";
import type { DuplicateCharactersOptions } from "../contract/params";
import type { DuplicateCharacterPair } from "../contract/results";

/** The owner's near-duplicate character pairs, CSLS-ranked (highest first), enriched with both card names. */
export async function readDuplicateCharacters(
  db: Db,
  ownerId: UserId,
  opts: DuplicateCharactersOptions = {},
): Promise<DuplicateCharacterPair[]> {
  const charA = aliasedTable(characters, "char_a");
  const charB = aliasedTable(characters, "char_b");
  const where = [eq(charA.ownerId, ownerId)];
  if (opts.minScore !== undefined) {
    where.push(gte(duplicateCharacterPairs.cslsScore, opts.minScore));
  }

  const base = db
    .select({
      id: duplicateCharacterPairs.id,
      characterIdA: duplicateCharacterPairs.characterIdA,
      characterIdB: duplicateCharacterPairs.characterIdB,
      nameA: charA.name,
      nameB: charB.name,
      similarity: duplicateCharacterPairs.similarity,
      cslsScore: duplicateCharacterPairs.cslsScore,
      model: duplicateCharacterPairs.model,
      computedAt: duplicateCharacterPairs.computedAt,
    })
    .from(duplicateCharacterPairs)
    .innerJoin(charA, eq(charA.id, duplicateCharacterPairs.characterIdA))
    .innerJoin(charB, eq(charB.id, duplicateCharacterPairs.characterIdB))
    .where(and(...where))
    .orderBy(desc(duplicateCharacterPairs.cslsScore));

  const rows = opts.limit !== undefined ? await base.limit(opts.limit) : await base;
  return rows;
}
