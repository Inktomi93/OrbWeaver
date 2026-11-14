// verb: listForChat — the room's attached scripts the room applies, in execution order. MEMBER-readable (the injected
// `requireChatMember`), so a member sees the room's set even when the scripts are the host's property (D18). The rows
// are the present host's own scripts, the set the turn applies (D64): a script a former host left on the room is not
// listed, and a hostless room lists none. A read: no audit.

import type { ListForChatParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { listHostChatScripts, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createListForChat(ctx: RegexContext): RegexService["listForChat"] {
  return async ({ principal, chatId }: ListForChatParams) => {
    await ctx.requireChatMember(principal, chatId);
    const hostUserId = await ctx.resolveChatHost(chatId);
    return hostUserId === null ? [] : (await listHostChatScripts(ctx.db, chatId, hostUserId)).map(toRow);
  };
}
