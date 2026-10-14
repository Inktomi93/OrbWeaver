// @subject tests/support/node/factories/chat.ts

import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { CHAT_OP_CODES } from "@orb/server/domain/chat";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors, seedRecallRoom } from "@orb/testkit/node/corpus-seed.ts";
import {
  captureChatGenerationObservations,
  captureChatReplayRows,
  captureCompactionSpend,
  seedChatInvite,
  seedInvitedChatParticipant,
} from "@orb/testkit/node/factories/chat.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const REPLY = "The ledger's orbital witness is complete.";

test("a real priced compaction captures the owner's durable spend and its current-marker repeat buys and writes nothing", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, connections } = await seedCorpusActors(root);
  await root.services.connection.update({
    principal: owner,
    connectionId: connections.text.id,
    patch: {
      declared: declaredCapabilitySchema.parse({
        ...connections.text.declared,
        features: { ...connections.text.declared?.features, pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
      }),
    },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  await caller.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "The traveller repairs the orbital witness ledger." });
  const compacted = await root.services.chat.compact({ principal: owner, chatId });
  expect(compacted.updated).toBe(true);
  expect(compacted.summary).toBe(REPLY);
  const captured = await captureCompactionSpend(root.db, root.ownerId);
  expect(captured).toHaveLength(1);
  expect(captured.every((row) => row.ownerId === root.ownerId && row.costUsd > 0)).toBe(true);
  const calls = provider.requests.filter((request) => request === "POST /v1/chat/completions");
  expect(calls).toHaveLength(1);
  expect(await root.services.chat.compact({ principal: owner, chatId })).toEqual({ ...compacted, updated: false });
  expect(await captureCompactionSpend(root.db, root.ownerId)).toEqual(captured);
  expect(provider.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual(calls);
});

test("a real held turn owns its lock until canonical commit, then captures replay deltas anchored to its returned assistant", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname === "/v1/chat/completions") {
      entered.resolve();
      await release.promise;
    }
    return await provider.execute(request);
  };
  await using root = await createServerHarness({ providerFetch: execute });
  const { owner } = await seedCorpusActors(root);
  const chatId = await seedRecallRoom(await root.internalCallerFor(root.ownerId));
  const sending = root.services.chat.send({ principal: owner, chatId, content: "Record the orbital witness." });
  try {
    await Promise.race([
      entered.promise,
      sending.then(() => {
        throw new Error("the actual turn finished before entering the held provider execution");
      }),
    ]);
    const during = await captureChatReplayRows(root.db, chatId);
    expect(during.locks.map((row) => row.chatId)).toEqual([chatId]);
    expect(during.locks.every((row) => row.holder !== "" && row.expiresAt > row.acquiredAt)).toBe(true);
    expect(during.stream).toEqual([]);
  } finally {
    release.resolve();
  }
  const result = await sending;
  expect(result.aborted).toBe(false);
  const assistant = result.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the real turn produced no assistant message");
  }
  const completed = await captureChatReplayRows(root.db, chatId);
  expect(completed.locks).toEqual([]);
  expect(completed.stream.map((row) => [row.chatId, row.messageId])).toEqual(completed.stream.map(() => [chatId, assistant.id]));
  expect(completed.stream.map((row) => row.delta).join("")).toBe(REPLY);
  expect(completed.stream.every((row) => row.generationId !== null)).toBe(true);
  expect(
    completed.events.filter((row) => row.payload.type === "messageCommitted").map((row) => row.payload.type === "messageCommitted" && row.payload.messageId),
  ).toEqual(result.messages.map((message) => message.id));
  expect(completed.events.some((row) => row.payload.type === "turnCompleted" && row.payload.messageId === assistant.id)).toBe(true);
});

test("a completed empty provider reply refuses canon but retains the actual generation observation without buying another reply", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: 40, completionTokens: 0 },
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, connections } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  await expect(root.services.chat.send({ principal: owner, chatId, content: "Record the refused orbital witness." })).rejects.toMatchObject({
    code: CHAT_OP_CODES.emptyGeneration,
  });
  const observations = await captureChatGenerationObservations(root.db, chatId);
  expect(observations.map((row) => [row.chatId, row.funderUserId, row.connectionId, row.model, row.tokensIn, row.tokensOut])).toEqual([
    [chatId, root.ownerId, connections.text.id, CORPUS_TEXT_MODEL, 40, 0],
  ]);
  expect((await caller.chat.listMessages({ chatId })).messages.map((message) => message.role)).toEqual(["user"]);
  expect(provider.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(1);
});

test("a real member send defers without a lock while its host is offline and the actual drain consumes the frozen funding identity once", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const chatId = await seedRecallRoom(await root.internalCallerFor(root.ownerId));
  const invite = await seedChatInvite(root.db, root.services.chat.createInvite, {
    principal: owner,
    chatId,
    input: { invitedHandle: member.handle },
  });
  await seedInvitedChatParticipant(root.db, root.services.chat.acceptInvite, { principal: member, inviteId: invite.id });
  const outcome = await root.services.chat.send({ principal: member, chatId, content: "Record the absent host's orbital witness.", timeZone: UTC_TIME_ZONE });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.map((message) => [message.role, message.authorUserId])).toEqual([["user", secondUserId]]);
  const deferred = await captureChatReplayRows(root.db, chatId);
  expect(deferred.locks).toEqual([]);
  expect(deferred.pending.map((row) => [row.chatId, row.triggeredBy, row.runAsUserId, row.timeZone])).toEqual([
    [chatId, secondUserId, root.ownerId, UTC_TIME_ZONE],
  ]);
  expect(provider.requests).not.toContain("POST /v1/chat/completions");
  expect(await root.services.chat.drainDeferredTurns({ hostUserId: root.ownerId })).toEqual({ ran: 1, dropped: 0 });
  const completed = await captureChatReplayRows(root.db, chatId);
  expect(completed.pending).toEqual([]);
  expect(completed.locks).toEqual([]);
  expect(completed.stream.map((row) => row.delta).join("")).toBe(REPLY);
  const calls = provider.requests.filter((request) => request === "POST /v1/chat/completions");
  expect(calls).toHaveLength(1);
  expect(await root.services.chat.drainDeferredTurns({ hostUserId: root.ownerId })).toEqual({ ran: 0, dropped: 0 });
  expect(provider.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual(calls);
});
