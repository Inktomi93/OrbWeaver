// domain/regex/persistence/ownership — the ownership gates. Both the script and an attachment target must
// belong to the caller; `requireOwnedScript` is the ONE script gate every owned-script verb calls, and the
// `ensure*Owned` pair gates the target side.
// Reads the characters/presets schema directly — a sanctioned cross-table read (domain-no-cross-feature bans
// importing the runtime code, not the shared @orb/db schema). A foreign/absent target collapses to
// RegexNotFoundError — no existence oracle.
//
// PRESETS carry a NULLABLE ownerId (the shared system default). A null owner matches no caller, so the same
// equality check that gates a foreign preset also makes the system preset un-attachable — which is correct:
// it is read-only by construction.

import type { Db } from "@orb/db";
import { characters, presets } from "@orb/db";
import type { CharacterId, PresetId, RegexScriptId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { RegexNotFoundError } from "../contract/errors.ts";
import type { ScriptRecord } from "../contract/rows.ts";
import { loadOwnedScript } from "./queries.ts";

const LIMIT_ONE = 1;

/** The owned script, or the ONE leak-free NotFound a foreign and an absent id share. */
export async function requireOwnedScript(db: Db, ownerId: UserId, scriptId: RegexScriptId): Promise<ScriptRecord> {
  const record = await loadOwnedScript(db, ownerId, scriptId);
  if (record === undefined) {
    throw new RegexNotFoundError("regex_script", scriptId);
  }
  return record;
}

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
