// domain/world-info/persistence/ownership — the attachment-TARGET ownership gates. A character/persona book
// attachment links a book to a character / persona; BOTH must belong to the caller. The book side is gated
// by `loadOwnedBook` (queries.ts); this file gates the target side.
//
// These read the `characters` / `personas` SCHEMA directly — a SANCTIONED cross-table read: the
// `domain-no-cross-feature` gate bans importing the character/persona DOMAINS' runtime code, NOT the shared
// `@orb/db` schema (persona's own `ensureCharacterOwned` reads `characters` the same way, and its comment
// names world-info attachments as the precedent). A foreign/absent target collapses to
// `WorldInfoNotFoundError` (no existence oracle — "not yours" and "doesn't exist" are one answer, matching
// the owner-scoped book/entry reads). D28: `characters` is the flat live row — there is no version table to
// resolve through; the gate keys on `characters.id` directly.

import type { Db } from "@orb/db";
import { characters, personas } from "@orb/db";
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { WorldInfoNotFoundError } from "../contract/errors";

const LIMIT_ONE = 1;

/** Gate: the character must belong to the caller (reads `characters.ownerId`). Throws
 *  `WorldInfoNotFoundError("character", …)` when foreign/absent. */
export async function ensureCharacterOwned(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<void> {
  const rows = await db
    .select({ ownerId: characters.ownerId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new WorldInfoNotFoundError("character", characterId);
  }
}

/** Gate: the persona must belong to the caller (reads `personas.ownerId`). Throws
 *  `WorldInfoNotFoundError("persona", …)` when foreign/absent. */
export async function ensurePersonaOwned(
  db: Db,
  ownerId: UserId,
  personaId: PersonaId,
): Promise<void> {
  const rows = await db
    .select({ ownerId: personas.ownerId })
    .from(personas)
    .where(eq(personas.id, personaId))
    .limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new WorldInfoNotFoundError("persona", personaId);
  }
}
