// verb: createEntry — mint an entry in an owned book; entries carry no owner of their own, they inherit
// via the book (D23). Fans `wiEntryAttached` out over every chat the book is attached to (empty fan-out
// is correct when the book has zero chat attachments).

import { entryMetadataSchema } from "@orb/contracts/world-info";
import { worldEntries } from "@orb/db";
import { resolveEntryScope } from "@orb/kit/world-info";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { CreateEntryParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { listChatIdsForBook, loadOwnedBook } from "../../persistence/queries";

export function createCreate(ctx: WorldInfoContext): WorldInfoService["createEntry"] {
  return async ({ principal, bookId, input }: CreateEntryParams) => {
    const ownerId = principal.userId;
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    const at = ctx.now();
    const entryId = ctx.newEntryId();
    const description = input.description ?? null;
    const keys = input.keys ?? null;
    const enabled = input.enabled ?? true;
    const priority = input.priority ?? 0;
    const ignoreBudget = input.ignoreBudget ?? false;
    const rawMetadata = input.metadata ?? null;
    const metadata = rawMetadata === null ? null : entryMetadataSchema.parse(rawMetadata);

    await ctx.db.insert(worldEntries).values({
      id: entryId,
      worldBookId: bookId,
      title: input.title,
      description,
      content: input.content,
      keys,
      enabled,
      priority,
      ignoreBudget,
      metadata,
      createdAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.createEntry",
        entityType: "world_entry",
        entityId: entryId,
        metadata: { bookId, title: input.title },
      },
      at,
    );

    const scope = resolveEntryScope(metadata, keys !== null && keys.length > 0);
    const chatIds = await listChatIdsForBook(ctx.db, bookId);
    for (const chatId of chatIds) {
      // biome-ignore lint/performance/noAwaitInLoops: the chat bus assigns a monotonic seq per emit — fan-out emits are sequential so per-chat ordering stays deterministic (the start-chat.ts seeded-greetings precedent).
      await ctx.emitWiEvent({ type: "wiEntryAttached", chatId, surface: "chat", entryId, scope });
    }
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });

    return {
      id: entryId,
      worldBookId: bookId,
      title: input.title,
      description,
      content: input.content,
      keys,
      enabled,
      priority,
      ignoreBudget,
      metadata,
    };
  };
}
