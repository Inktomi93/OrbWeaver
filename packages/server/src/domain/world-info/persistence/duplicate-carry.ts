// domain/world-info/persistence/duplicate-carry — the world-info-owned character_books CARRY for
// character.duplicate. A named exception to "persistence is queries only": the character domain
// never writes character_books itself (world-info owns that junction, D28), so the duplicate verb consumes
// this as an INJECTED op wired at the compose root.
//
// REFERENCE-carry, not content-clone: the SAME world_books are re-pointed at the new character id via fresh
// character_books rows (role preserved; createdAt is FRESH — the carry is a new attach at ctx.now(), not a
// copy of the source timestamp). The books themselves are standalone entities and are NEVER cloned. A
// source with zero attachments copies nothing.
//
// OWNED-SOURCE GATE (`ownerId`) — TWO ENDS, both re-checked here rather than inherited from `duplicate`'s
// discipline. An injected op is a DOMAIN BOUNDARY: its signature is the only promise the next call site or
// the next wiring inherits, and a carry that re-points arbitrary attachments would hand a stranger's lore to
// whoever named the ids. The portability twin (`link-carried-books`) carries the same two gates.
//   • CHARACTERS: both ids must be the caller's own (`bothOwned`) — a foreign source or target carries
//     nothing at all.
//   • BOOKS (#1516): the source's junction rows may point at world_books owned by SOMEONE ELSE
//     (`handoff-copy-write.ts`'s header says such rows exist in practice), so the carry SELECTS THROUGH
//     `worldBooks.ownerId` and copies only the caller's own books. Without that predicate, owning the two
//     characters was enough to mint the caller a fresh, durable reference to a stranger's book — a reader
//     the book's owner never granted, and one that survives after the source junction is gone. Foreign rows
//     are DROPPED SILENTLY (this op returns void and `duplicate` has no report channel; refusing the whole
//     carry would let one stranger-owned junction row break a user's own duplicate — the twin likewise
//     skips rather than refuses).
//
// RETRY-SAFE: the attach insert is `onConflictDoNothing` on the (characterId, worldBookId) PK, so a carry
// re-run after a later failure in `duplicate` converges instead of erroring on rows it already wrote.

import { characterBooks, characters, worldBooks } from "@orb/db";
import { and, eq, inArray } from "drizzle-orm";
import type { CopyCharacterBooks, WorldInfoDuplicateCarryContext } from "../contract/import.ts";

/** Both character ids present in the caller's own library — the owned-source gate, resolved in ONE round
 *  trip (`persona/persistence/queries.ts`'s `ensureCharacterOwned` idiom). A foreign or absent id on either
 *  end silently copies nothing: this op is a best-effort carry inside `duplicate`, not a door that answers. */
async function bothOwned(ctx: WorldInfoDuplicateCarryContext, args: Parameters<CopyCharacterBooks>[0]): Promise<boolean> {
  const rows = await ctx.db
    .select({ id: characters.id })
    .from(characters)
    .where(and(inArray(characters.id, [args.fromCharacterId, args.toCharacterId]), eq(characters.ownerId, args.ownerId)));
  const owned = rows.map((r) => r.id);
  return owned.includes(args.fromCharacterId) && owned.includes(args.toCharacterId);
}

export function createCopyCharacterBooks(ctx: WorldInfoDuplicateCarryContext): CopyCharacterBooks {
  return async (args): Promise<void> => {
    const { fromCharacterId, toCharacterId } = args;
    const { db } = ctx;
    // The op re-checks tenancy itself rather than inheriting its call site's discipline (see the header).
    if (!(await bothOwned(ctx, args))) {
      return;
    }
    // The BOOK end of the gate: an INNER JOIN through world_books with the caller's ownerId, so a junction
    // row pointing at a foreign book is never in the result set to begin with (a post-filter would be a
    // second source of truth for the same predicate).
    const rows = await db
      .select({ worldBookId: characterBooks.worldBookId, role: characterBooks.role })
      .from(characterBooks)
      .innerJoin(worldBooks, eq(worldBooks.id, characterBooks.worldBookId))
      .where(and(eq(characterBooks.characterId, fromCharacterId), eq(worldBooks.ownerId, args.ownerId)));
    if (rows.length === 0) {
      return;
    }
    const at = ctx.now();
    // IDEMPOTENT (the `import-write` attach precedent): the junction PK is (characterId, worldBookId), so a
    // re-run — `duplicate` failing after this carry landed and the operator retrying it — would otherwise
    // hit a UNIQUE violation and turn a benign retry into a permanent failure. Doing nothing on conflict
    // converges on the state the first carry already reached; the row that is there is the same reference.
    await db
      .insert(characterBooks)
      .values(
        rows.map((r) => ({
          characterId: toCharacterId,
          worldBookId: r.worldBookId,
          role: r.role,
          createdAt: at,
        })),
      )
      .onConflictDoNothing();
  };
}
