// verb: listForChat — the room's attached scripts, in execution order. MEMBER-readable (the injected
// `requireChatMember`) and NOT owner-filtered, so a member sees the room's set even when the scripts are the
// host's property (D18). The turn applies only the host-owned rows (D64). A read: no audit.

import type { ListForChatParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { listChatScripts, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createListForChat(ctx: RegexContext): RegexService["listForChat"] {
  return async ({ principal, chatId }: ListForChatParams) => {
    await ctx.requireChatMember(principal, chatId);
    return (await listChatScripts(ctx.db, chatId)).map(toRow);
  };
}
