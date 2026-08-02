// domain/world-info/persistence/duplicate-carry — the world-info-owned character_books CARRY for
// character.duplicate (PD-141). A named exception to "persistence is queries only": the character domain
// never writes character_books itself (world-info owns that junction, D28), so the duplicate verb consumes
// this as an INJECTED op wired at the compose root.
//
// REFERENCE-carry, not content-clone: the SAME world_books are re-pointed at the new character id via fresh
// character_books rows (role preserved; createdAt is FRESH — the carry is a new attach at ctx.now(), not a
// copy of the source timestamp). The books themselves are standalone entities and are NEVER cloned. A
// source with zero attachments copies nothing.
//
// OWNED-SOURCE GATE (`ownerId`): the op proves BOTH character ids are the caller's before it writes a
// junction row, rather than trusting `duplicate` to have loaded the source owned first. An injected op is a
// DOMAIN BOUNDARY — its signature is the only promise the next call site or the next wiring inherits, and a
// carry that re-points arbitrary attachments would hand a stranger's lore to whoever named the ids. The
// portability twin (`link-carried-books`, PD-144) already carried exactly this guard.

import { characterBooks, characters } from "@orb/db";
import { and, eq, inArray } from "drizzle-orm";
import type { CopyCharacterBooks, WorldInfoDuplicateCarryContext } from "../contract/import";

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
    // The op re-checks tenancy itself rather than inheriting its call site's discipline: the source's
    // attachments name world_books the caller may not own, so carrying them onto an arbitrary target would
    // hand a stranger's lore to whoever asked (the `LinkCarriedBooks` import twin already guards this).
    if (!(await bothOwned(ctx, args))) {
      return;
    }
    const rows = await db
      .select({ worldBookId: characterBooks.worldBookId, role: characterBooks.role })
      .from(characterBooks)
      .where(eq(characterBooks.characterId, fromCharacterId));
    if (rows.length === 0) {
      return;
    }
    const at = ctx.now();
    await db.insert(characterBooks).values(
      rows.map((r) => ({
        characterId: toCharacterId,
        worldBookId: r.worldBookId,
        role: r.role,
        createdAt: at,
      })),
    );
  };
}
