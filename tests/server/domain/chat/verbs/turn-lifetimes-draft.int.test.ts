// @subject packages/server/src/domain/chat/verbs/turn.ts
import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { withCancellationPeer } from "./turn-cancellation-physical.ts";

test("a draft consumer's return closes its actual native request without leaving generation or canon behind", async () => {
  await withCancellationPeer("stream", async ({ h, peer, events }) => {
    const iter = h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId })[Symbol.asyncIterator]();
    const finish = iter.return?.bind(iter);
    if (finish === undefined) {
      throw new Error("the actual draft subscription has no consumer finalizer");
    }
    try {
      const first = await iter.next();
      expect(first.done).toBe(false);
      expect(first.value?.delta).toBe("first");
      expect(peer.stopped()).toBe(false);
      await finish(undefined);
      await expect.poll(peer.stopped).toBe(true);
      await peer.disconnected;
      expect(peer.stopped()).toBe(true);
      expect(peer.destroyed()).toBe(true);
      expect(peer.writeLate()).toBe(false);
      expect(peer.requests).toHaveLength(1);
      await expect(h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId })).resolves.toBeUndefined();
      expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
      expect(await h.root.db.select().from(messageVariants)).toEqual([]);
      expect(events.filter(({ type }) => type === "messageCommitted" || type === "turnCompleted")).toEqual([]);
    } finally {
      await finish(undefined);
      await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
      peer.closeConnections();
      if (peer.requests.length > 0) {
        await peer.disconnected;
      }
    }
  });
});
