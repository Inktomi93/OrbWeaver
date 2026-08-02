// domain/regex/persistence/ownership — attachment-TARGET ownership gates. Both the script and the target
// must belong to the caller; the script side is gated by `loadOwnedScript`, this file gates the target side.
// Reads the characters/presets schema directly — a sanctioned cross-table read (domain-no-cross-feature bans
// importing the runtime code, not the shared @orb/db schema). A foreign/absent target collapses to
// RegexNotFoundError — no existence oracle.
//
// PRESETS carry a NULLABLE ownerId (the shared system default). A null owner matches no caller, so the same
// equality check that gates a foreign preset also makes the system preset un-attachable — which is correct:
// it is read-only by construction.

import type { Db } from "@orb/db";
import { characters, presets } from "@orb/db";
import type { CharacterId, PresetId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { RegexNotFoundError } from "../contract/errors";

const LIMIT_ONE = 1;

export async function ensureCharacterOwned(db: Db, ownerId: UserId, characterId: CharacterId): Promise<void> {
  const rows = await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, characterId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new RegexNotFoundError("character", characterId);
  }
}

export async function ensurePresetOwned(db: Db, ownerId: UserId, presetId: PresetId): Promise<void> {
  const rows = await db.select({ ownerId: presets.ownerId }).from(presets).where(eq(presets.id, presetId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new RegexNotFoundError("preset", presetId);
  }
}
