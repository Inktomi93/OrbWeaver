// A script reaches every room that reads it through a tier: the room's own junction, a present seat of a character it
// is attached to, and, when it is global or on a preset, every room where its owner holds a present seat (the host's
// tiers draw for the room's members). The over-reach of a preset script into a room on another preset is a spare
// refresh, never a missed one. Plural capture retains each script's rooms for confirmation.
import type { Db } from "@orb/db";
import { characterRegexScripts, chatParticipants, chatRegexScripts, globalRegexScripts, presetRegexScripts, regexScripts } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { RegexRoomReach } from "../contract/room-reach.ts";

async function resolveRegexScriptsRooms(db: Db, scriptIds: readonly RegexScriptId[]): Promise<Map<RegexScriptId, ChatId[]>> {
  const byScript = new Map<RegexScriptId, ChatId[]>();
  if (scriptIds.length === 0) {
    return byScript;
  }
  const ids = [...scriptIds];
  const [chatScoped, characterScoped, ownerScoped] = await Promise.all([
    db
      .select({ chatId: chatRegexScripts.chatId, scriptId: chatRegexScripts.regexScriptId })
      .from(chatRegexScripts)
      .where(inArray(chatRegexScripts.regexScriptId, ids)),
    db
      .select({ chatId: chatParticipants.chatId, scriptId: characterRegexScripts.regexScriptId })
      .from(characterRegexScripts)
      .innerJoin(chatParticipants, eq(chatParticipants.characterId, characterRegexScripts.characterId))
      .where(and(inArray(characterRegexScripts.regexScriptId, ids), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq))),
    db
      .select({ chatId: chatParticipants.chatId, scriptId: regexScripts.id })
      .from(regexScripts)
      .innerJoin(chatParticipants, eq(chatParticipants.userId, regexScripts.ownerId))
      .where(
        and(
          inArray(regexScripts.id, ids),
          or(
            inArray(regexScripts.id, db.select({ id: globalRegexScripts.regexScriptId }).from(globalRegexScripts)),
            inArray(regexScripts.id, db.select({ id: presetRegexScripts.regexScriptId }).from(presetRegexScripts)),
          ),
          eq(chatParticipants.kind, "human"),
          isNull(chatParticipants.leftSeq),
        ),
      ),
  ]);
  for (const row of [...chatScoped, ...characterScoped, ...ownerScoped]) {
    byScript.set(row.scriptId, [...(byScript.get(row.scriptId) ?? []), row.chatId]);
  }
  return byScript;
}

/** Read the regex attachment junctions against the room seats they reach. */
export function createRegexRoomReach(handle: DatabaseHandle): RegexRoomReach {
  const db = databaseForOwner(handle);
  return {
    script: async (scriptId) => (await resolveRegexScriptsRooms(db, [scriptId])).get(scriptId) ?? [],
    scripts: (scriptIds) => resolveRegexScriptsRooms(db, scriptIds),
  };
}
