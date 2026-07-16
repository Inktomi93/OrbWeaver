// domain/world-info/persistence/duplicate-carry — the world-info-owned character_books CARRY for
// character.duplicate (PD-141). A named exception to "persistence is queries only": the character domain
// never writes character_books itself (world-info owns that junction, D28), so the duplicate verb consumes
// this as an INJECTED op wired at the compose root.
//
// REFERENCE-carry, not content-clone: the SAME world_books are re-pointed at the new character id via fresh
// character_books rows (role preserved; createdAt is FRESH — the carry is a new attach at ctx.now(), not a
// copy of the source timestamp). The books themselves are standalone entities and are NEVER cloned. A
// source with zero attachments copies nothing.

import { characterBooks } from "@orb/db";
import { eq } from "drizzle-orm";
import type { CopyCharacterBooks, WorldInfoDuplicateCarryContext } from "../contract/import";

export function createCopyCharacterBooks(ctx: WorldInfoDuplicateCarryContext): CopyCharacterBooks {
  return async ({ fromCharacterId, toCharacterId }): Promise<void> => {
    const { db } = ctx;
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
