// verb: listForChat — the room's attached scripts, in execution order. MEMBER-readable (the injected
// `requireChatMember`) and NOT owner-filtered: a room's attachments are what every member's turns assemble
// against, so a member sees the room's set even when the scripts are the host's property (the `listChatBooks`
// ruling, D18/D64). A read: no audit.

import type { RegexContext } from "../../context";
import type { ListForChatParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { listChatScripts, toRow } from "../../persistence/queries";

export function createListForChat(ctx: RegexContext): RegexService["listForChat"] {
  return async ({ principal, chatId }: ListForChatParams) => {
    await ctx.requireChatMember(principal, chatId);
    return (await listChatScripts(ctx.db, chatId)).map(toRow);
  };
}
