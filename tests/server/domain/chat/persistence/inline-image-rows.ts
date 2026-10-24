// The stored rows a native inline-image turn leaves: the selected assistant variant's metadata sidecar, the
// room's message_assets links, the owner's generated CAS assets and the durable chat_events log.
import { parseVariantMetadata } from "@orb/contracts/chat";
import { assets, chatEvents, messageAssets, messages, messageVariants } from "@orb/db";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";

export function inlineImageRows(h: ChatRoot): {
  readonly selected: () => Promise<ReturnType<typeof parseVariantMetadata> | undefined>;
  readonly links: () => Promise<(typeof messageAssets.$inferSelect)[]>;
  readonly generated: () => Promise<(typeof assets.$inferSelect)[]>;
  readonly events: () => Promise<(typeof chatEvents.$inferSelect)[]>;
} {
  return {
    selected: async (): Promise<ReturnType<typeof parseVariantMetadata> | undefined> => {
      const row = await h.root.db
        .select({ metadata: messageVariants.metadata })
        .from(messages)
        .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
        .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant")))
        .orderBy(messages.seq)
        .get();
      return row === undefined ? undefined : parseVariantMetadata(row.metadata);
    },
    links: async () =>
      await h.root.db
        .select({ link: messageAssets })
        .from(messageAssets)
        .innerJoin(messages, eq(messages.id, messageAssets.messageId))
        .where(eq(messages.chatId, h.chatId))
        .then((rows) => rows.map(({ link }) => link)),
    generated: async () =>
      await h.root.db
        .select()
        .from(assets)
        .where(and(eq(assets.ownerId, h.owner.userId), eq(assets.kind, "generated"))),
    events: async () => await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)),
  };
}
