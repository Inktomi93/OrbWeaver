// verb: attachToChat — attach a caller-OWNED book to a chat room (the chat-book JOIN; idempotent on the
// composite key). Chats are MEMBERSHIP-scoped (D18), so the room gate is the INJECTED `requireChatHost`
// (chat's own guard — room-wide prompt content is a one-shot jailbreak surface, the chat-injection
// precedent: write = host). The book gate stays ownership (`loadOwnedBook` — the host shares THEIR book).
// Only a REAL insert emits `wiBookAttached` (the injected chat-bus emit) + `worldInfoChanged` (the user-bus
// freshness emit to the acting host — every attachment mutation fires it per the contract header) + audits —
// an idempotent re-attach is silent (no phantom pool-invalidation event).

import { chatBooks } from "@orb/db";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { AttachToChatParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { loadOwnedBook } from "../../persistence/queries";

export function createAttachToChat(ctx: WorldInfoContext): WorldInfoService["attachToChat"] {
  return async ({ principal, chatId, bookId }: AttachToChatParams) => {
    const ownerId = principal.userId;
    const [, book] = await Promise.all([
      ctx.requireChatHost(principal, chatId),
      loadOwnedBook(ctx.db, ownerId, bookId),
    ]);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    const at = ctx.now();
    const inserted = await ctx.db
      .insert(chatBooks)
      .values({ chatId, worldBookId: bookId, createdAt: at })
      .onConflictDoNothing()
      .returning({ worldBookId: chatBooks.worldBookId });
    if (inserted.length === 0) {
      return; // already attached — idempotent, no event, no audit
    }
    await ctx.emitWiEvent({ type: "wiBookAttached", chatId, surface: "chat", bookId });
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.attachToChat",
        entityType: "world_book",
        entityId: bookId,
        metadata: { chatId },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
  };
}
