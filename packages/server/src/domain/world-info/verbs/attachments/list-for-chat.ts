// verb: listForChat — the books attached to a chat room, newest first (`role` null on this scope). Gate:
// the INJECTED `requireChatMember` (D18 — the attached books are ROOM-PUBLIC prompt content every member's
// turns assemble against, so the list is member-read like `listChatInjections`; the rows are NOT
// owner-filtered). A read: no audit, no event.

import type { WorldInfoContext } from "#src/domain/world-info/context.ts";
import type { ListForChatParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { listChatBooks } from "#src/domain/world-info/persistence/queries.ts";

export function createListForChat(ctx: WorldInfoContext): WorldInfoService["listForChat"] {
  return async ({ principal, chatId, includeInherited }: ListForChatParams) => {
    await ctx.requireChatMember(principal, chatId);
    if (includeInherited !== true) {
      return listChatBooks(ctx.db, chatId);
    }
    const [inherited, attached] = await Promise.all([ctx.readInheritedChatBooks(principal, chatId), listChatBooks(ctx.db, chatId)]);
    return [...inherited, ...attached];
  };
}
