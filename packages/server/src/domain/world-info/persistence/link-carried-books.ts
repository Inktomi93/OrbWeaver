// domain/world-info/persistence/link-carried-books — the world-info-owned character_books RE-LINK for
// character IMPORT (PD-144). The portability twin of duplicate-carry: a portable card carries attached-book
// REFERENCES (`{worldBookId, role}`), and after the imported character row lands this op re-points each id
// at the new character via a fresh character_books row. A named exception to "persistence is queries only":
// the import/character domains never write character_books themselves (world-info owns that junction, D28),
// so import consumes this as an INJECTED op wired at the compose root.
//
// THE OWNED-SOURCE GATE (security-load-bearing): a carried id is a plain string from an untrusted card — it
// links ONLY when a world_book with that id EXISTS and is OWNED by the importing user. An absent or
// cross-tenant id is skipped (and counted), never linked — this is what stops a crafted card from attaching
// another tenant's book to the importer's character. Books are NEVER cloned — references only.

import { characterBooks, worldBooks } from "@orb/db";
import { and, eq, inArray } from "drizzle-orm";
import type { LinkCarriedBooks, WorldInfoDuplicateCarryContext } from "../contract/import.ts";

export function createLinkCarriedBooks(ctx: WorldInfoDuplicateCarryContext): LinkCarriedBooks {
  return async ({ ownerId, characterId, refs }) => {
    if (refs.length === 0) {
      return { linked: 0, skipped: 0 };
    }
    const { db } = ctx;
    // The owned-source gate: resolve which of the carried ids are books this user actually owns.
    const owned = await db
      .select({ id: worldBooks.id })
      .from(worldBooks)
      .where(
        and(
          eq(worldBooks.ownerId, ownerId),
          inArray(
            worldBooks.id,
            refs.map((r) => r.worldBookId),
          ),
        ),
      );
    // @orb-gate-ignore persistence-no-in-memory-state: query-local membership Set for the owned-source gate
    const ownedIds = new Set(owned.map((r) => r.id));
    const linkable = refs.filter((r) => ownedIds.has(r.worldBookId));
    if (linkable.length === 0) {
      return { linked: 0, skipped: refs.length };
    }
    const at = ctx.now();
    // Fresh junction rows, roles preserved. onConflictDoNothing keeps a re-import onto an already-linked
    // character idempotent (the PK is `(characterId, worldBookId)`), so nothing double-inserts.
    await db
      .insert(characterBooks)
      .values(
        linkable.map((r) => ({
          characterId,
          worldBookId: r.worldBookId,
          role: r.role,
          createdAt: at,
        })),
      )
      .onConflictDoNothing();
    return { linked: linkable.length, skipped: refs.length - linkable.length };
  };
}
