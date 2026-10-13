// Only room-level attachments are member-visible; plural capture retains each script's rooms for confirmation.
import type { Db } from "@orb/db";
import { chatRegexScripts } from "@orb/db";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";
import type { RegexRoomReach } from "../contract/room-reach.ts";

async function resolveRegexScriptRooms(db: Db, scriptId: RegexScriptId): Promise<ChatId[]> {
  const rows = await db.select({ chatId: chatRegexScripts.chatId }).from(chatRegexScripts).where(eq(chatRegexScripts.regexScriptId, scriptId));
  return rows.map((row) => row.chatId);
}

async function resolveRegexScriptsRooms(db: Db, scriptIds: readonly RegexScriptId[]): Promise<Map<RegexScriptId, ChatId[]>> {
  const byScript = new Map<RegexScriptId, ChatId[]>();
  if (scriptIds.length === 0) {
    return byScript;
  }
  const rows = await db
    .select({ chatId: chatRegexScripts.chatId, scriptId: chatRegexScripts.regexScriptId })
    .from(chatRegexScripts)
    .where(inArray(chatRegexScripts.regexScriptId, [...scriptIds]));
  for (const row of rows) {
    byScript.set(row.scriptId, [...(byScript.get(row.scriptId) ?? []), row.chatId]);
  }
  return byScript;
}

/** Read the regex-owned room junction rather than host, preset or character library tiers. */
export function createRegexRoomReach(db: Db): RegexRoomReach {
  return {
    script: (scriptId) => resolveRegexScriptRooms(db, scriptId),
    scripts: (scriptIds) => resolveRegexScriptsRooms(db, scriptIds),
  };
}
