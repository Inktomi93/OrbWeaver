// domain/regex/persistence/queries — all db access for the script library. Every owner-scoped read puts the
// ownerId in the WHERE (never a bare eq(id) — that is the cross-tenant hole). `toRow` parses the stored
// behavior blob at the read seam; a corrupt blob degrades to the INERT script (empty find pattern, no
// placements) rather than nulling the row, so a broken body never removes a name from the owner's library.
//
// Attachment reads join the junction → the script and order by the junction `position` (execution order IS
// data — `executeRegexScripts` applies its input list in order). Ties break on `createdAt` so a batch of
// same-position rows is still deterministic.
//
// The REVERSE rosters read the same junctions from the script's side, and therefore name their CARRIERS —
// so this file joins `presets`/`characters` for a name column. A sanctioned cross-table read, the
// `persistence/ownership` posture verbatim: domain-no-cross-feature bans importing another domain's runtime
// CODE, not the shared `@orb/db` schema, and the owner predicate rides on the joined table itself.

import type { RegexAttachmentRef, RegexScriptBehavior, RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { characterRegexScripts, characters, chatRegexScripts, globalRegexScripts, presetRegexScripts, presets, regexScripts } from "@orb/db";
import type { CharacterId, ChatId, PresetId, RegexScriptId, UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { ScriptRecord } from "../contract/rows";

const LIMIT_ONE = 1;

/** The degrade target for a corrupt behavior blob: parses, runs nothing (no placement ⇒ every leg skips it). */
const INERT_BEHAVIOR: RegexScriptBehavior = regexScriptBehaviorSchema.parse({ findRegex: "", replaceString: "", placement: [] });

const behaviorParser = regexScriptBehaviorSchema.catch(INERT_BEHAVIOR);

export function toRow(record: ScriptRecord): RegexScriptRow {
  return { id: record.id, name: record.name, enabled: record.enabled, ...behaviorParser.parse(record.behavior) };
}

export async function loadOwnedScript(db: Db, ownerId: UserId, scriptId: RegexScriptId): Promise<ScriptRecord | undefined> {
  const rows = await db
    .select()
    .from(regexScripts)
    .where(and(eq(regexScripts.id, scriptId), eq(regexScripts.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The owner's scripts whose ids are in `scriptIds` — the carried-reference gate (a foreign/absent id simply
 *  does not come back, so the caller can never attach a row it does not own). */
export async function loadOwnedScriptsByIds(db: Db, ownerId: UserId, scriptIds: readonly RegexScriptId[]): Promise<ScriptRecord[]> {
  if (scriptIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(regexScripts)
    .where(and(eq(regexScripts.ownerId, ownerId), inArray(regexScripts.id, scriptIds)));
}

export async function listOwnedScripts(db: Db, ownerId: UserId): Promise<ScriptRecord[]> {
  return await db.select().from(regexScripts).where(eq(regexScripts.ownerId, ownerId)).orderBy(desc(regexScripts.createdAt));
}

export async function listGlobalScripts(db: Db, ownerId: UserId): Promise<ScriptRecord[]> {
  const rows = await db
    .select({ script: regexScripts })
    .from(globalRegexScripts)
    .innerJoin(regexScripts, eq(globalRegexScripts.regexScriptId, regexScripts.id))
    .where(eq(regexScripts.ownerId, ownerId))
    .orderBy(asc(globalRegexScripts.position), asc(regexScripts.createdAt));
  return rows.map((r) => r.script);
}

export async function listCharacterScripts(db: Db, ownerId: UserId, characterId: CharacterId): Promise<ScriptRecord[]> {
  const rows = await db
    .select({ script: regexScripts })
    .from(characterRegexScripts)
    .innerJoin(regexScripts, eq(characterRegexScripts.regexScriptId, regexScripts.id))
    .where(and(eq(characterRegexScripts.characterId, characterId), eq(regexScripts.ownerId, ownerId)))
    .orderBy(asc(characterRegexScripts.position), asc(regexScripts.createdAt));
  return rows.map((r) => r.script);
}

export async function listPresetScripts(db: Db, ownerId: UserId, presetId: PresetId): Promise<ScriptRecord[]> {
  const rows = await db
    .select({ script: regexScripts })
    .from(presetRegexScripts)
    .innerJoin(regexScripts, eq(presetRegexScripts.regexScriptId, regexScripts.id))
    .where(and(eq(presetRegexScripts.presetId, presetId), eq(regexScripts.ownerId, ownerId)))
    .orderBy(asc(presetRegexScripts.position), asc(regexScripts.createdAt));
  return rows.map((r) => r.script);
}

// ── The REVERSE rosters: "who attaches THIS script" (`listScriptUsage`) ───────────────────────────────
// The mirror image of the four reads above — same junctions, read from the SCRIPT side. Ordered by carrier
// NAME, not junction `position`: position is per-CARRIER execution order and says nothing across carriers,
// where a roster is scanned by eye for a name. Both sides stay owner-filtered (the script's own gate is the
// verb's `loadOwnedScript`; the carrier's is the join predicate here), so neither half can name a row the
// caller does not own. The ROOM roster is deliberately absent from this file — rooms carry no ownerId, so
// their visibility is chat's to answer (the injected `resolveVisibleRooms`); all this file knows is which
// chat ids the junction holds.

export async function listPresetsAttaching(db: Db, ownerId: UserId, scriptId: RegexScriptId): Promise<RegexAttachmentRef<PresetId>[]> {
  const rows = await db
    .select({ id: presets.id, name: presets.name })
    .from(presetRegexScripts)
    .innerJoin(presets, eq(presetRegexScripts.presetId, presets.id))
    .where(and(eq(presetRegexScripts.regexScriptId, scriptId), eq(presets.ownerId, ownerId)))
    .orderBy(asc(presets.name));
  return rows;
}

export async function listCharactersAttaching(db: Db, ownerId: UserId, scriptId: RegexScriptId): Promise<RegexAttachmentRef<CharacterId>[]> {
  const rows = await db
    .select({ id: characters.id, name: characters.name })
    .from(characterRegexScripts)
    .innerJoin(characters, eq(characterRegexScripts.characterId, characters.id))
    .where(and(eq(characterRegexScripts.regexScriptId, scriptId), eq(characters.ownerId, ownerId)))
    .orderBy(asc(characters.name));
  return rows;
}

/** The chat ids the script is attached to — CANDIDATES, not an answer: which of them the caller may see (and
 *  what they are called) is chat's, resolved through the injected `resolveVisibleRooms`. */
export async function listChatIdsAttaching(db: Db, scriptId: RegexScriptId): Promise<ChatId[]> {
  const rows = await db.select({ chatId: chatRegexScripts.chatId }).from(chatRegexScripts).where(eq(chatRegexScripts.regexScriptId, scriptId));
  return rows.map((r) => r.chatId);
}

/** Not owner-filtered — a room's attached scripts are room-public prompt content (membership is the caller's
 *  gate). The `listChatBooks` posture, verbatim. */
export async function listChatScripts(db: Db, chatId: ChatId): Promise<ScriptRecord[]> {
  const rows = await db
    .select({ script: regexScripts })
    .from(chatRegexScripts)
    .innerJoin(regexScripts, eq(chatRegexScripts.regexScriptId, regexScripts.id))
    .where(eq(chatRegexScripts.chatId, chatId))
    .orderBy(asc(chatRegexScripts.position), asc(regexScripts.createdAt));
  return rows.map((r) => r.script);
}
