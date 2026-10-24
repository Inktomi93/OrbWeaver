// An expired chat_locks lease changes owner at the release boundary between committed speakers; the lock
// row names the new holder and the committed-so-far canon rows remain.
// @subject packages/server/src/domain/chat/engine/round.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { chatLocks, closeDb, messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  freshHeldDb,
} from "@orb/testkit/node/composed";
import { seedPeerLeaseRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";

test("a mid-round locked refusal returns the committed-so-far without throwing", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The first speaker commits before the lease changes.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = ownership.use(
    await createChatRoot({
      server: { db: held.db },
      providerFetch: physical.execute,
      group: { output: "per-speaker", policy: "list" },
      characters: ["Aria", "Bran", "Cara"].map((name) =>
        createCharacterSchema.parse({ handle: name.toLowerCase(), name, description: `${name} speaks in order.` }),
      ),
    }),
  );
  const releaseBoundary = held.hold(/^delete from "chat_locks"/u);
  const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Speak in order." });
  const settled = Promise.allSettled([sending]);
  try {
    await releaseBoundary.reached;
    const before = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
    expect(before.map(({ role }) => role)).toEqual(["user", "assistant"]);
    const lease = await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get();
    if (lease === undefined) {
      throw new Error("the completed first speaker has no lease to release");
    }
    const voice = h.characters[0];
    if (voice === undefined) {
      throw new Error("the completed round has no voice for the peer replica");
    }
    const peer = ownership.use(
      await seedPeerLeaseRows(h.root, {
        chatId: h.chatId,
        characterId: voice.id,
        hostUserId: h.owner.userId,
        holder: "replacement-replica",
        aheadMs: lease.expiresAt - h.root.clock.now() + 1,
      }),
    );
    expect(peer.row.acquiredAt).toBeGreaterThanOrEqual(lease.expiresAt);
    releaseBoundary.release();
    const outcome = await sending;
    expect(outcome.aborted).toBe(false);
    const committed = outcome.messages.filter(({ role }) => role === "assistant");
    expect(committed).toHaveLength(1);
    expect(committed.map(({ characterId }) => characterId)).toEqual([h.characters[0]?.id]);
    expect(committed.map(({ id }) => id)).toEqual(before.filter(({ role }) => role === "assistant").map(({ id }) => id));
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(before);
    expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(1);
    expect(await h.root.db.select({ holder: chatLocks.holder }).from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([
      { holder: "replacement-replica" },
    ]);
  } finally {
    releaseBoundary.release();
    await settled;
  }
});
