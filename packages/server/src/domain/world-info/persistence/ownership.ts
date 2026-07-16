// domain/world-info/persistence/ownership — attachment-TARGET ownership gates. Both book and target must
// belong to the caller; the book side is gated by loadOwnedBook, this file gates the target side. Reads
// the characters/personas schema directly — a sanctioned cross-table read (domain-no-cross-feature bans
// importing the runtime code, not the shared @orb/db schema). A foreign/absent target collapses to
// WorldInfoNotFoundError — no existence oracle.

import type { Db } from "@orb/db";
import { characters, personas } from "@orb/db";
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { WorldInfoNotFoundError } from "../contract/errors";

const LIMIT_ONE = 1;

export async function ensureCharacterOwned(db: Db, ownerId: UserId, characterId: CharacterId): Promise<void> {
  const rows = await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, characterId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new WorldInfoNotFoundError("character", characterId);
  }
}

export async function ensurePersonaOwned(db: Db, ownerId: UserId, personaId: PersonaId): Promise<void> {
  const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new WorldInfoNotFoundError("persona", personaId);
  }
}
