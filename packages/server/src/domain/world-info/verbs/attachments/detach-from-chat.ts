// verb: detachFromChat — remove a book↔chat attachment (idempotent — `detached:false` when already absent).
// Room gate: the INJECTED `requireChatHost` (D18 — host authority over room config; the book's owner is NOT
// re-checked, so the host can always clean the room, e.g. after a host handoff left a prior host's book
// attached). Only a real removal emits `wiBookDetached` + audits.

import { chatBooks } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { DetachFromChatParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";

export function createDetachFromChat(ctx: WorldInfoContext): WorldInfoService["detachFromChat"] {
  return async ({ principal, chatId, bookId }: DetachFromChatParams) => {
    await ctx.requireChatHost(principal, chatId);
    const at = ctx.now();
    const removed = await ctx.db
      .delete(chatBooks)
      .where(and(eq(chatBooks.chatId, chatId), eq(chatBooks.worldBookId, bookId)))
      .returning({ worldBookId: chatBooks.worldBookId });
    if (removed.length === 0) {
      return { detached: false };
    }
    await ctx.emitWiEvent({ type: "wiBookDetached", chatId, surface: "chat", bookId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "worldInfo.detachFromChat",
        entityType: "world_book",
        entityId: bookId,
        metadata: { chatId },
      },
      at,
    );
    return { detached: true };
  };
}
