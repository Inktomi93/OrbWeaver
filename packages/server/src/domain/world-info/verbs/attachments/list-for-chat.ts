// verb: listForChat — the books attached to a chat room, newest first (`role` null on this scope). Gate:
// the INJECTED `requireChatMember` (D18 — the attached books are ROOM-PUBLIC prompt content every member's
// turns assemble against, so the list is member-read like `listChatInjections`; the rows are NOT
// owner-filtered). A read: no audit, no event.

import type { ListForChatParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { listChatBooks } from "../../persistence/queries";

export function createListForChat(ctx: WorldInfoContext): WorldInfoService["listForChat"] {
  return async ({ principal, chatId }: ListForChatParams) => {
    await ctx.requireChatMember(principal, chatId);
    return listChatBooks(ctx.db, chatId);
  };
}
