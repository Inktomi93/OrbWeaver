// domain/discovery/persistence/character-scope — the ONE `characters` belt every owner analytics read wears.
// Discovery answers questions about a person's LIBRARY, and a synthetic character is not a library card: it
// is the per-room group-as-character bucket (`__group__<chatId>`) that exists so a group digest has a real
// `scopedCharacterId` FK. Counting it inflates catalog totals, and embedding it puts a non-card in the hub
// space every other card's CSLS is measured against. The predicate lived spelled-out in six reads and was
// present in only three of them — hence one home.

import { characters } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq } from "drizzle-orm";

/**
 * "A real card of this owner" — `characters.ownerId = :owner AND NOT characters.synthetic`. An `undefined`/
 * `null` owner is the documented ALL-OWNERS mode of the bulk passes: the owner half drops, the synthetic
 * half NEVER does (a synthetic card is not a library card for any owner).
 */
export function ownedRealCharacters(ownerId?: UserId | null): SQL {
  const real = eq(characters.synthetic, false);
  if (ownerId === undefined || ownerId === null) {
    return real;
  }
  // `and` of two defined predicates is always a SQL — the undefined arm needs no caller ceremony.
  return and(eq(characters.ownerId, ownerId), real) ?? real;
}
