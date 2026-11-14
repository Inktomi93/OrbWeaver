// verb: listForChat — the books attached to a chat room that the room applies, newest first (`role` null on this
// scope). Gate: the INJECTED `requireChatMember` (D18 — the attached books are ROOM-PUBLIC prompt content every
// member's turns assemble against, so the list is member-read like `listChatInjections`). The rows are filtered to the
// present host's own books, the set the turn's pool applies (D64): a book a former host left on the room is not
// listed, and a hostless room lists none. A read: no audit, no event.

import type { ListForChatParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoContext, WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { listHostChatBooks } from "#src/domain/world-info/persistence/queries.ts";

export function createListForChat(ctx: WorldInfoContext): WorldInfoService["listForChat"] {
  return async ({ principal, chatId, includeInherited }: ListForChatParams) => {
    await ctx.requireChatMember(principal, chatId);
    const hostUserId = await ctx.resolveChatHost(chatId);
    const attached = hostUserId === null ? [] : await listHostChatBooks(ctx.db, chatId, hostUserId);
    if (includeInherited !== true) {
      return attached;
    }
    return [...(await ctx.readInheritedChatBooks(principal, chatId)), ...attached];
  };
}
