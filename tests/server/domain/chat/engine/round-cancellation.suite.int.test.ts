// @subject packages/server/src/domain/chat/engine/round.ts
// Cancellation enters through real active-turn ownership while only physical provider I/O is held.
import { createCharacterSchema } from "@orb/contracts/character";
import { chatLocks, messages } from "@orb/db";
import { CHAT_OP_CODES, ChatOperationError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  seedPeerLease,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

async function heldRound(
  stopAt: number,
  names: readonly string[],
): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly entered: Promise<AbortSignal>;
    readonly release: () => void;
    readonly requests: () => number;
  }
> {
  await using construction = new AsyncDisposableStack();
  const entered = Promise.withResolvers<AbortSignal>();
  const release = Promise.withResolvers<void>();
  let requests = 0;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The first speaker's committed reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      group: { output: "per-speaker", policy: "list" },
      characters: names.map((name) => createCharacterSchema.parse({ handle: name.toLowerCase(), name, description: `${name} speaks in order.` })),
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
          requests += 1;
          if (requests === stopAt) {
            const interrupted = Promise.withResolvers<never>();
            const onAbort = (): void => interrupted.reject(request.signal.reason);
            request.signal.addEventListener("abort", onAbort, { once: true });
            try {
              request.signal.throwIfAborted();
              entered.resolve(request.signal);
              await Promise.race([release.promise, interrupted.promise]);
            } finally {
              request.signal.removeEventListener("abort", onAbort);
            }
          }
        }
        return await physical.execute(request);
      },
    }),
  );
  construction.defer(() => release.resolve());
  const lifetime = construction.move();
  return { h, entered: entered.promise, release: () => release.resolve(), requests: () => requests, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("a second-speaker lock loss preserves the first canon and rejects the actual caller without driving another speaker", async () => {
  await using fixture = await heldRound(2, ["Aria", "Bran", "Cara"]);
  const { h } = fixture;
  const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Speak in order." });
  const settled = Promise.allSettled([sending]);
  try {
    const signal = await fixture.entered;
    const before = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
    expect(before.map(({ role }) => role)).toEqual(["user", "assistant"]);
    expect(before[1]?.characterId).toBe(h.characters[0]?.id);
    const lease = await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get();
    if (lease === undefined) {
      throw new Error("the actual second-speaker turn has no held lease");
    }
    const ttl = lease.expiresAt - lease.acquiredAt;
    const voice = h.characters[0];
    if (voice === undefined) {
      throw new Error("the actual round has no voice for the peer replica");
    }
    await using _peer = await seedPeerLease(h.root, {
      chatId: h.chatId,
      characterId: voice.id,
      hostUserId: h.owner.userId,
      holder: "replacement-replica",
      aheadMs: lease.expiresAt - h.root.clock.now() + 1,
    });
    h.root.timers.advance(ttl);
    const [result] = await settled;
    expect(signal.aborted).toBe(true);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") {
      throw new Error("a lost real turn lease did not reject the public caller");
    }
    expect(result.reason).toBeInstanceOf(ChatOperationError);
    expect(result.reason).toMatchObject({ code: CHAT_OP_CODES.aborted });
    await h.root.settleBackground();
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(before);
    expect(fixture.requests()).toBe(2);
  } finally {
    fixture.release();
    await settled;
  }
});

for (const [stopAt, names, title] of [
  [1, ["Aria"], "single-speaker: an aborted engine outcome propagates aborted:true + reason"],
  [2, ["Aria", "Bran", "Cara"], "mid-round multi-speaker: speaker 1 commits, speaker 2 aborts → round carries BOTH the committed row AND aborted:true"],
] as const) {
  test(title, async () => {
    await using fixture = await heldRound(stopAt, names);
    const { h } = fixture;
    const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Speak in order." });
    const settled = Promise.allSettled([sending]);
    try {
      const signal = await fixture.entered;
      await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
      const outcome = await sending;
      expect(signal.aborted).toBe(true);
      expect(outcome.aborted).toBe(true);
      expect(outcome.abortReason).toBe("user");
      const committed = outcome.messages.filter(({ role }) => role === "assistant");
      expect(committed).toHaveLength(stopAt - 1);
      expect(committed.map(({ characterId }) => characterId)).toEqual(h.characters.slice(0, stopAt - 1).map(({ id }) => id));
      const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
      expect(canon.map(({ role }) => role)).toEqual(stopAt === 1 ? ["user"] : ["user", "assistant"]);
      expect(canon.filter(({ role }) => role === "assistant").map(({ id }) => id)).toEqual(committed.map(({ id }) => id));
      expect(fixture.requests()).toBe(stopAt);
    } finally {
      fixture.release();
      await settled;
    }
  });
}
