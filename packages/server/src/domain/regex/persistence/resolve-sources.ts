// domain/regex/persistence/resolve-sources — the standalone factory behind `ResolveRegexSources` (the
// chat-turn seam, contract/resolve.ts). Principal-LESS by construction: every id it takes was already gated
// by the caller (the turn resolves under the frozen `runAsUserId`, D19), so this is a pure keyed read.
//
// THE CAST SLICE IS ROSTER-ORDERED, and that is load-bearing: the union feeds `executeRegexScripts`, which
// applies its list IN ORDER, so a multi-character room's precedence is the roster's. ONE `inArray` read
// brings every seated character's attachments back at once and the rows are REGROUPED into roster order
// here — a per-character read loop was N round-trips for the same answer, and a bare `inArray` WITHOUT the
// regroup would silently hand the executor table order instead of the roster's.

import { characterRegexScripts, regexScripts } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { RegexResolveContext, ResolvedRegexSources, ResolveRegexSources } from "../contract/resolve.ts";
import type { ScriptRecord } from "../contract/rows.ts";
import { listChatScripts, listGlobalScripts, listPresetScripts, toRow } from "./queries.ts";

/** Every seated character's attached rows, concatenated in ROSTER order (see the header). */
async function castSlice(ctx: RegexResolveContext, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<ScriptRecord[]> {
  if (characterIds.length === 0) {
    return [];
  }
  const rows = await ctx.db
    .select({ characterId: characterRegexScripts.characterId, script: regexScripts })
    .from(characterRegexScripts)
    .innerJoin(regexScripts, eq(characterRegexScripts.regexScriptId, regexScripts.id))
    .where(and(inArray(characterRegexScripts.characterId, [...characterIds]), eq(regexScripts.ownerId, ownerId)))
    .orderBy(asc(characterRegexScripts.position), asc(regexScripts.createdAt));

  // Regroup by the ROSTER's order, not the query's. WITHIN a character the query's ORDER BY already holds.
  return characterIds.flatMap((characterId) => rows.filter((row) => row.characterId === characterId).map((row) => row.script));
}

export function createResolveRegexSources(ctx: RegexResolveContext): ResolveRegexSources {
  return async ({ ownerId, presetId, characterIds, chatId }): Promise<ResolvedRegexSources> => {
    const [hostGlobal, preset, cast, chat] = await Promise.all([
      listGlobalScripts(ctx.db, ownerId),
      presetId === null ? Promise.resolve<ScriptRecord[]>([]) : listPresetScripts(ctx.db, ownerId, presetId),
      castSlice(ctx, ownerId, characterIds),
      listChatScripts(ctx.db, chatId),
    ]);
    return {
      hostGlobal: hostGlobal.map(toRow),
      preset: preset.map(toRow),
      cast: cast.map(toRow),
      chat: chat.map(toRow),
    };
  };
}
