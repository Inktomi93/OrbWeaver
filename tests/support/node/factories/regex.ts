// Regex seeds run the production verbs and return their outcomes; rows-tier twins in `rows/regex.ts` read the rows.

import type { characterRegexScripts, chatRegexScripts, globalRegexScripts, presetRegexScripts, regexScripts } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type RegexService = ServicesResult["services"]["regex"];

export type RegexScriptDbRow = typeof regexScripts.$inferSelect;
export type GlobalRegexScriptRow = typeof globalRegexScripts.$inferSelect;
export type CharacterRegexScriptRow = typeof characterRegexScripts.$inferSelect;
export type PresetRegexScriptRow = typeof presetRegexScripts.$inferSelect;
export type ChatRegexScriptRow = typeof chatRegexScripts.$inferSelect;

/** Run the owner's script creation; its view is the seed's result. */
export async function seedRegexScript(
  root: ServerProducerRoot,
  params: Parameters<RegexService["createScript"]>[0],
): Promise<Awaited<ReturnType<RegexService["createScript"]>>> {
  return await root.services.regex.createScript(params);
}

/** The real operation appends to the owner's tier; the seed does not invent an execution position. */
export async function seedGlobalRegexScript(
  root: ServerProducerRoot,
  params: Parameters<RegexService["attachGlobal"]>[0],
): Promise<Awaited<ReturnType<RegexService["attachGlobal"]>>> {
  return await root.services.regex.attachGlobal(params);
}

export interface CapturedRegexRows {
  readonly scripts: readonly RegexScriptDbRow[];
  readonly global: readonly GlobalRegexScriptRow[];
  readonly character: readonly CharacterRegexScriptRow[];
  readonly preset: readonly PresetRegexScriptRow[];
  readonly chat: readonly ChatRegexScriptRow[];
}
