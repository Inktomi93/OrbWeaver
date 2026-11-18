// A live turn's vendor fingerprint is STORED on the variant row, under one declared key of the parsed metadata
// sidecar — the per-turn record an operator queries, not a value that only lives as long as the call.
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/contracts/src/chat/messages.ts

import type { TurnOutcome } from "@orb/contracts/chat";
import { parseVariantMetadata, VARIANT_METADATA_SYSTEM_FINGERPRINT_KEY } from "@orb/contracts/chat";
import { messages, messageVariants } from "@orb/db";
import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { OpenAiServer } from "@orb/testkit/node/helpers";
import { openAiServer } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";

const FINGERPRINT = "fp_fixture_9c14be";

/** The selected assistant variant's raw metadata blob — a persistence read of the row the turn committed. */
async function storedMetadata(h: ChatRoot): Promise<unknown> {
  const row = await h.root.db
    .select({ metadata: messageVariants.metadata })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant")))
    .get();
  return row?.metadata;
}

/** A room whose chat endpoint is the scripted vendor frame; every other provider call keeps the corpus. The
 *  caller's stack owns the root, so the room's lifetime is the caller's `await using`, never this helper's. */
async function fingerprintRoom(
  stack: AsyncDisposableStack,
  chat: OpenAiServer,
): Promise<{
  readonly h: ChatRoot;
  readonly turn: () => Promise<TurnOutcome>;
}> {
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = stack.use(
    await createChatRoot({
      server: { clock: createFrozenClock() },
      memoryEnabled: false,
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        return request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")
          ? await chat.execute(request)
          : await corpus.execute(request);
      },
    }),
  );
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const turn = async (): Promise<TurnOutcome> => {
    const character = h.characters[0];
    if (character === undefined) {
      throw new Error("the fingerprint room has no seated character");
    }
    return await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  };
  return { h, turn };
}

test("a turn the vendor fingerprinted stores that fingerprint on the selected variant", async () => {
  using chat = openAiServer([], () => ({ fingerprint: FINGERPRINT }));
  await using construction = new AsyncDisposableStack();
  const room = await fingerprintRoom(construction, chat);
  const outcome = await room.turn();
  // Positive control: the turn itself committed, so the stored blob is this turn's.
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  expect(parseVariantMetadata(await storedMetadata(room.h))[VARIANT_METADATA_SYSTEM_FINGERPRINT_KEY]).toBe(FINGERPRINT);
});
