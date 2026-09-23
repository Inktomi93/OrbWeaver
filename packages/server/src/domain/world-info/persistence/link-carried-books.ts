// domain/world-info/persistence/link-carried-books — the world-info-owned character_books RE-LINK for
// character IMPORT. The portability twin of duplicate-carry: a portable card carries attached-book
// REFERENCES (`{worldBookId, role}`), and after the imported character row lands this op re-points each id
// at the new character via a fresh character_books row. A named exception to "persistence is queries only":
// the import/character domains never write character_books themselves (world-info owns that junction, D28),
// so import consumes this as an INJECTED op wired at the compose root.
//
// TWO GATES, BOTH SECURITY-LOAD-BEARING — the SOURCE side and the TARGET side (#1414 seam 3):
//   • SOURCE: a carried id is a plain string from an untrusted card — it links ONLY when a world_book with
//     that id EXISTS and is OWNED by the importing user. An absent or cross-tenant id is skipped (and
//     counted), never linked — this is what stops a crafted card from attaching another tenant's book to the
//     importer's character. Books are NEVER cloned — references only.
//   • TARGET: `characterId` is likewise verified as the importer's own before any junction row is written.
//     Its only live caller mints that character under the same principal a few lines earlier, so this was
//     never exploitable — but "safe because of who calls it" is a comment, not a placement (constitution §2),
//     and an injected op's signature is the whole promise the NEXT wiring inherits.

import type { Db } from "@orb/db";
import { characterBooks, characters, worldBooks } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { LinkCarriedBooks, WorldInfoDuplicateCarryContext } from "../contract/import.ts";

const LIMIT_ONE = 1;

/** Is the TARGET character the importer's own? (#1414 seam 3.) The op is a DOMAIN BOUNDARY: its signature is
 *  the only promise the next call site inherits, and the source side alone being gated says nothing about
 *  where the junction lands. Its twin `duplicate-carry` already re-checks its own target for this reason. */
async function targetOwned(db: Db, ownerId: UserId, characterId: CharacterId): Promise<boolean> {
  const rows = await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, characterId)).limit(LIMIT_ONE);
  return rows[0]?.ownerId === ownerId;
}

export function createLinkCarriedBooks(ctx: WorldInfoDuplicateCarryContext): LinkCarriedBooks {
  return async ({ ownerId, characterId, refs }) => {
    if (refs.length === 0) {
      return { linked: 0, skipped: 0 };
    }
    const { db } = ctx;
    // A foreign/absent target links NOTHING and reports every ref skipped — the same best-effort silence the
    // owned-source gate below already gives a foreign BOOK (this op answers a caller, it is not a door).
    if (!(await targetOwned(db, ownerId, characterId))) {
      return { linked: 0, skipped: refs.length };
    }
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
    // @orb-waive persistence-no-in-memory-state(Set): query-local membership Set for the owned-source gate. Ends if it outlives the call.
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
