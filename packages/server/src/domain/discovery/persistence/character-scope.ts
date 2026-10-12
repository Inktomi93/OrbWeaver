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

const realCharacters = (): SQL => eq(characters.synthetic, false);

/**
 * "A real card of this owner" — `characters.ownerId = :owner AND NOT characters.synthetic`.
 *
 * @remarks The owner is required and the predicate has one path, so `owner-scoped-reads` proves every read
 * that wears it. A bulk pass with no owner says so by calling {@link realCharactersOfEveryOwner} instead.
 */
export function ownedRealCharacters(ownerId: UserId): SQL {
  // `and` of two defined predicates is always a SQL; the fallback only satisfies its declared `| undefined`.
  return and(eq(characters.ownerId, ownerId), realCharacters()) ?? eq(characters.ownerId, ownerId);
}

/** Every owner's real cards — the ALL-OWNERS mode of the bulk system passes, which run with no Principal. The
 *  synthetic half never drops: a synthetic card is not a library card for any owner. */
export function realCharactersOfEveryOwner(): SQL {
  return realCharacters();
}
