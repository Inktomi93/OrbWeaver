// domain/regex/persistence/resolve-sources — the standalone factory behind `ResolveRegexSources` (the
// chat-turn seam, contract/resolve.ts). Principal-LESS by construction: every id it takes was already gated
// by the caller (the turn resolves under the frozen `runAsUserId`, D19), so this is a pure keyed read.
//
// THE CHARACTER SLICE IS ROSTER-ORDERED, and that is load-bearing: the union feeds `executeRegexScripts`, which
// applies its list IN ORDER, so a multi-character room's precedence is the roster's. ONE `inArray` read
// brings every seated character's attachments back at once and the rows are REGROUPED into roster order
// here — a per-character read loop was N round-trips for the same answer, and a bare `inArray` WITHOUT the
// regroup would silently hand the executor table order instead of the roster's.

import type { CharacterRegexSlice } from "@orb/contracts/chat";
import { characterRegexScripts, regexScripts } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { RegexResolveContext, ResolvedRegexSources, ResolveRegexSources } from "../contract/resolve.ts";
import type { ScriptRecord } from "../contract/rows.ts";
import { listChatScripts, listGlobalScripts, listPresetScripts, toRow } from "./queries.ts";

/** Every seated character's attached rows, PER SEAT, in ROSTER order (see the header). */
async function characterSlices(ctx: RegexResolveContext, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<CharacterRegexSlice[]> {
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
  // The grouping is KEPT (#1742/F3): each seat is its own tier downstream — its own allow flag and its own
  // group in the room's Regex section — and the `flatMap` this used to end with threw exactly that away.
  return characterIds.map((characterId) => ({
    characterId,
    scripts: rows.filter((row) => row.characterId === characterId).map((row) => toRow(row.script)),
  }));
}

export function createResolveRegexSources(ctx: RegexResolveContext): ResolveRegexSources {
  return async ({ ownerId, presetId, characterIds, chatId }): Promise<ResolvedRegexSources> => {
    const [hostGlobal, preset, character, chat] = await Promise.all([
      listGlobalScripts(ctx.db, ownerId),
      presetId === null ? Promise.resolve<ScriptRecord[]>([]) : listPresetScripts(ctx.db, ownerId, presetId),
      characterSlices(ctx, ownerId, characterIds),
      listChatScripts(ctx.db, chatId),
    ]);
    return {
      hostGlobal: hostGlobal.map(toRow),
      preset: preset.map(toRow),
      character,
      chat: chat.map(toRow),
    };
  };
}
