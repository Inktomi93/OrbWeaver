// domain/regex/persistence/resolve-sources — the standalone factory behind `ResolveRegexSources` (the
// chat-turn seam, contract/resolve.ts). Principal-LESS by construction: every id it takes was already gated
// by the caller (the turn resolves under the frozen `runAsUserId`, D19), so this is a pure keyed read.
//
// The CAST slice concatenates per character IN ROSTER ORDER — the order is load-bearing (the union feeds
// `executeRegexScripts`, which applies its list in order), so this cannot be a single `inArray` read: that
// would return rows in table order and silently scramble a multi-character room's precedence.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { RegexResolveContext, ResolvedRegexSources, ResolveRegexSources } from "../contract/resolve";
import type { ScriptRecord } from "./queries";
import { listCharacterScripts, listChatScripts, listGlobalScripts, listPresetScripts, toRow } from "./queries";

async function castSlice(db: Db, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<ScriptRecord[]> {
  const out: ScriptRecord[] = [];
  for (const characterId of characterIds) {
    // biome-ignore lint/performance/noAwaitInLoops: roster ORDER is the precedence order (see the header) — one small keyed read per seated character, deliberately sequential.
    out.push(...(await listCharacterScripts(db, ownerId, characterId)));
  }
  return out;
}

export function createResolveRegexSources(ctx: RegexResolveContext): ResolveRegexSources {
  return async ({ ownerId, presetId, characterIds, chatId }): Promise<ResolvedRegexSources> => {
    const [hostGlobal, preset, cast, chat] = await Promise.all([
      listGlobalScripts(ctx.db, ownerId),
      presetId === null ? Promise.resolve<ScriptRecord[]>([]) : listPresetScripts(ctx.db, ownerId, presetId),
      castSlice(ctx.db, ownerId, characterIds),
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
