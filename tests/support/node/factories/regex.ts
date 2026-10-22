// Actual regex operations own behavior, scope order and authority; these seeds capture their canonical rows.
import type { Db } from "@orb/db";
import { characterRegexScripts, chatRegexScripts, globalRegexScripts, presetRegexScripts, regexScripts } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq, inArray } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type RegexService = ServicesResult["services"]["regex"];

export type RegexScriptDbRow = typeof regexScripts.$inferSelect;
export type GlobalRegexScriptRow = typeof globalRegexScripts.$inferSelect;
export type CharacterRegexScriptRow = typeof characterRegexScripts.$inferSelect;
export type PresetRegexScriptRow = typeof presetRegexScripts.$inferSelect;
export type ChatRegexScriptRow = typeof chatRegexScripts.$inferSelect;

/** Produces the script through the real library operation without reconstructing its behavior blob. */
export async function seedRegexScript(root: ServerProducerRoot, params: Parameters<RegexService["createScript"]>[0]): Promise<RegexScriptDbRow> {
  const db = root.db;
  const createScript = root.services.regex.createScript;
  const view = await createScript(params);
  const row = await db.select().from(regexScripts).where(eq(regexScripts.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production script creation left no canonical regex-script row");
  }
  return row;
}

/** The real operation appends to the owner's tier; the seed does not invent an execution position. */
export async function seedGlobalRegexScript(root: ServerProducerRoot, params: Parameters<RegexService["attachGlobal"]>[0]): Promise<GlobalRegexScriptRow> {
  const db = root.db;
  const attachGlobal = root.services.regex.attachGlobal;
  await attachGlobal(params);
  const row = await db.select().from(globalRegexScripts).where(eq(globalRegexScripts.regexScriptId, params.scriptId)).get();
  if (row === undefined) {
    throw new Error("production script attachment left no canonical global-regex-script row");
  }
  return row;
}

/** Captures the junction after real ownership gates and idempotent append policy. */
export async function seedCharacterRegexScript(
  root: ServerProducerRoot,
  params: Parameters<RegexService["attachToCharacter"]>[0],
): Promise<CharacterRegexScriptRow> {
  const db = root.db;
  const attachToCharacter = root.services.regex.attachToCharacter;
  await attachToCharacter(params);
  const row = await db
    .select()
    .from(characterRegexScripts)
    .where(and(eq(characterRegexScripts.characterId, params.characterId), eq(characterRegexScripts.regexScriptId, params.scriptId)))
    .get();
  if (row === undefined) {
    throw new Error("production script attachment left no canonical character-regex-script row");
  }
  return row;
}

/** Captures the real preset junction without substituting a status, position or timestamp. */
export async function seedPresetRegexScript(root: ServerProducerRoot, params: Parameters<RegexService["attachToPreset"]>[0]): Promise<PresetRegexScriptRow> {
  const db = root.db;
  const attachToPreset = root.services.regex.attachToPreset;
  await attachToPreset(params);
  const row = await db
    .select()
    .from(presetRegexScripts)
    .where(and(eq(presetRegexScripts.presetId, params.presetId), eq(presetRegexScripts.regexScriptId, params.scriptId)))
    .get();
  if (row === undefined) {
    throw new Error("production script attachment left no canonical preset-regex-script row");
  }
  return row;
}

/** The actual host gate runs before the room junction is captured. */
export async function seedChatRegexScript(root: ServerProducerRoot, params: Parameters<RegexService["attachToChat"]>[0]): Promise<ChatRegexScriptRow> {
  const db = root.db;
  const attachToChat = root.services.regex.attachToChat;
  await attachToChat(params);
  const row = await db
    .select()
    .from(chatRegexScripts)
    .where(and(eq(chatRegexScripts.chatId, params.chatId), eq(chatRegexScripts.regexScriptId, params.scriptId)))
    .get();
  if (row === undefined) {
    throw new Error("production script attachment left no canonical chat-regex-script row");
  }
  return row;
}

/** Already-produced script IDs select complete canonical tiers without another normalization or attach pass. */
export async function captureRegexRows(db: Db, ids: readonly RegexScriptDbRow["id"][]): Promise<CapturedRegexRows> {
  const [scripts, global, character, preset, chat] = await Promise.all([
    db.select().from(regexScripts).where(inArray(regexScripts.id, ids)).orderBy(regexScripts.id),
    db.select().from(globalRegexScripts).where(inArray(globalRegexScripts.regexScriptId, ids)).orderBy(globalRegexScripts.regexScriptId),
    db
      .select()
      .from(characterRegexScripts)
      .where(inArray(characterRegexScripts.regexScriptId, ids))
      .orderBy(characterRegexScripts.regexScriptId, characterRegexScripts.characterId),
    db
      .select()
      .from(presetRegexScripts)
      .where(inArray(presetRegexScripts.regexScriptId, ids))
      .orderBy(presetRegexScripts.regexScriptId, presetRegexScripts.presetId),
    db.select().from(chatRegexScripts).where(inArray(chatRegexScripts.regexScriptId, ids)).orderBy(chatRegexScripts.regexScriptId, chatRegexScripts.chatId),
  ]);
  if (scripts.length !== new Set(ids).size) {
    throw new Error("produced regex script IDs do not all have canonical rows");
  }
  return { scripts, global, character, preset, chat };
}

interface CapturedRegexRows {
  readonly scripts: readonly RegexScriptDbRow[];
  readonly global: readonly GlobalRegexScriptRow[];
  readonly character: readonly CharacterRegexScriptRow[];
  readonly preset: readonly PresetRegexScriptRow[];
  readonly chat: readonly ChatRegexScriptRow[];
}
