// verb: listForChat — the room's attached scripts the room applies, in execution order. MEMBER-readable (the injected
// `requireChatMember`, D18: membership scopes who may ask). The rows are the present host's own scripts, the set the
// turn applies (D64): a script a former host left on the room is not listed, and a hostless room lists none. A read:
// no audit.
//
// SECURITY: the rows are the host's library, so only the host reads them whole. A non-host member reads exactly the
// room-tier part of their display read, through chat's injected `roomTierForMember`: nothing while the host withholds
// their display scripts, and otherwise only the enabled display-pass rows the room's levers apply. A former host is a
// member here like any other.

import type { ListForChatParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { listHostChatScripts, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createListForChat(ctx: RegexContext): RegexService["listForChat"] {
  return async ({ principal, chatId }: ListForChatParams) => {
    await ctx.requireChatMember(principal, chatId);
    const hostUserId = await ctx.resolveChatHost(chatId);
    if (hostUserId === null) {
      return [];
    }
    const rows = (await listHostChatScripts(ctx.db, chatId, hostUserId)).map(toRow);
    return principal.userId === hostUserId ? rows : await ctx.roomTierForMember(chatId, rows);
  };
}
