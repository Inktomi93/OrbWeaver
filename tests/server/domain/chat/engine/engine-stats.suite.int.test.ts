// @subject packages/server/src/domain/chat/engine/engine.ts
// Compare the actual live writer with a public reconcile over the same generated canon.
import "@orb/testkit/node/composed-real.ts";
import type { TurnOutcome } from "@orb/contracts/chat";
import { parseVariantMetadata, VARIANT_METADATA_REASONING_MS_KEY } from "@orb/contracts/chat";
import { builtinProvider } from "@orb/contracts/inference";
import { characterStats, chatGenerationObservations, dailyStats, messages, messageVariants, modelStats, ownerStats } from "@orb/db";
import { createFrozenClock } from "@orb/testkit/iso/clock.ts";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { captureSdkSessionRows } from "@orb/testkit/node/factories/connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { createSdkProcessSpawner } from "@orb/testkit/node/sdk-process.ts";
import { and, eq } from "drizzle-orm";
import { STATS_SDK_CACHE_1H, STATS_SDK_MODEL, STATS_SDK_REPLY, STATS_SDK_THINKING } from "./stats-sdk-physical.mjs";

test("new-slot + swipe + continue + reviewed impersonate commit: no drift vs reconcileStats", async () => {
  const replies = [
    { text: "the first reply here", usage: { promptTokens: 10, completionTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 3 } },
    { text: "an alternative and longer take", usage: { promptTokens: 12, completionTokens: 25, cacheReadTokens: 6, cacheWriteTokens: 4 } },
    { text: " and even more", usage: { promptTokens: 3, completionTokens: 8, cacheReadTokens: 1, cacheWriteTokens: 1 } },
    { text: "the user speaks next", usage: { promptTokens: 4, completionTokens: 6, cacheReadTokens: 0, cacheWriteTokens: 0 } },
  ];
  let nextReply = 0;
  const endpoint = builtinProvider("openai")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("the canonical OpenAI provider has no fixed endpoint");
  }
  const hostname = new URL(endpoint).hostname;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: {
      secretBoxKey: Buffer.alloc(32, 1),
      networkExecution: {
        resolver: (host): Promise<readonly string[]> =>
          host === hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error(`unscripted native stats address resolution: ${host}`)),
      },
    },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
        return await corpus.execute(request);
      }
      const reply = replies[nextReply++];
      if (reply === undefined) {
        throw new Error("the four physical stats replies are exhausted");
      }
      return new Response(
        `data: {"choices":[{"delta":{"content":${JSON.stringify(reply.text)}}}]}\n\n${terminalSseLine({ usage: reply.usage })}\n\ndata: [DONE]\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "openai", key: "controlled-stats-native-openai-token" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "openai",
    credentialId: credential.id,
    baseUrl: null,
    model: "gpt-6.1-sol",
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 } },
      features: { detectServer: false, pricing: { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 0.5 } },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const generated = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(generated.aborted).toBe(false);
  expect(generated.messages).toHaveLength(1);
  const source = generated.messages[0];
  if (source === undefined) {
    throw new Error("the real stats generate committed no assistant slot");
  }
  const firstGeneration = await rollups(h);
  for (const grain of ["owner", "characters", "days", "models"] as const) {
    expect(firstGeneration[grain]).toMatchObject([{ tokensIn: 10, tokensOut: 20 }]);
    expect(firstGeneration[grain]).toHaveLength(1);
    expect(firstGeneration[grain][0]?.costUsd).toBeCloseTo(0.000_044, 12);
  }
  for (const grain of ["owner", "characters", "days"] as const) {
    expect(firstGeneration[grain]).toMatchObject([{ assistantTurns: 1 }]);
  }
  for (const grain of ["owner", "models"] as const) {
    expect(firstGeneration[grain]).toMatchObject([{ cacheReadTokens: 5, cacheWriteTokens: 3 }]);
  }
  expect(firstGeneration.models).toMatchObject([{ generations: 1 }]);
  expect(firstGeneration.owner[0]?.ownerId).toBe(h.owner.userId);
  expect(firstGeneration.characters[0]?.characterId).toBe(source.characterId);
  expect(firstGeneration.models[0]?.model).toBe(connection.model);
  expect((await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: source.id })).aborted).toBe(false);
  expect((await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: source.id })).aborted).toBe(false);
  const beforeDraft = await rollups(h);
  const canonBeforeDraft = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const variantsBeforeDraft = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id)).orderBy(messageVariants.idx);
  let draft = "";
  for await (const { delta } of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId })) {
    draft += delta;
  }
  expect(draft).toBe("the user speaks next");
  const afterDraft = await rollups(h);
  expect(afterDraft.characters).toEqual(beforeDraft.characters);
  for (const grain of ["owner", "models", "days"] as const) {
    expect(afterDraft[grain]).toEqual(
      beforeDraft[grain].map((row) => ({
        ...row,
        tokensIn: row.tokensIn + 4,
        tokensOut: row.tokensOut + 6,
        tokensInMeasuredSamples: row.tokensInMeasuredSamples + 1,
        tokensOutMeasuredSamples: row.tokensOutMeasuredSamples + 1,
        costUsd: row.costUsd + 0.000_016,
        costSamples: row.costSamples + 1,
      })),
    );
  }
  const observedDraft = await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId));
  expect(observedDraft).toMatchObject([
    { funderUserId: h.owner.userId, connectionId: connection.id, sourceMessageId: null, sourceVariantId: null, tokensIn: 4, tokensOut: 6, costUsd: 0.000_016 },
  ]);
  expect(observedDraft).toHaveLength(1);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(canonBeforeDraft);
  expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id)).orderBy(messageVariants.idx)).toEqual(
    variantsBeforeDraft,
  );
  await h.root.services.stats.reconcile(h.owner.userId);
  const reconciledDraft = await rollups(h);
  expect(afterDraft.characters).toHaveLength(1);
  const characterBefore = afterDraft.characters[0];
  const characterAfter = reconciledDraft.characters[0];
  if (characterBefore === undefined || characterAfter === undefined) {
    throw new Error("the real stats workload lost its character rollup");
  }
  // Live inverses and a canon rebuild accumulate USD doubles in different orders.
  expect(characterAfter.costUsd).toBeCloseTo(characterBefore.costUsd, 12);
  expect(reconciledDraft).toEqual({ ...afterDraft, characters: [{ ...characterBefore, costUsd: characterAfter.costUsd }] });
  const committed = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: draft });
  expect(committed.aborted).toBe(false);
  expect(committed.messages).toMatchObject([{ role: "user", content: draft, authorUserId: h.owner.userId }]);
  const live = await rollups(h);
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await rollups(h)).toEqual(live);
  expect(live.owner).toMatchObject([{ assistantTurns: 1, swipes: 1, userTurns: 1, variantMessages: 1, maxContextTokens: 32_000 }]);
  expect(live.owner[0]?.costUsd).toBeGreaterThan(0);
  expect(live.owner[0]?.cacheReadTokens).toBeGreaterThan(0);
  expect(live.owner[0]?.cacheWriteTokens).toBeGreaterThan(0);
  expect(nextReply).toBe(4);
});

interface RollupSnapshot {
  readonly owner: readonly Omit<typeof ownerStats.$inferSelect, "id" | "computedAt">[];
  readonly characters: readonly Omit<typeof characterStats.$inferSelect, "id" | "computedAt">[];
  readonly days: readonly Omit<typeof dailyStats.$inferSelect, "id" | "computedAt">[];
  readonly models: readonly Omit<typeof modelStats.$inferSelect, "id" | "computedAt">[];
}

function stable<T extends { readonly computedAt: number; readonly id?: string }>(row: T): Omit<T, "id" | "computedAt"> {
  const { id: _id, computedAt: _computedAt, ...values } = row;
  return values;
}

async function rollups(h: ChatRoot): Promise<RollupSnapshot> {
  return {
    owner: (await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId))).map(stable),
    characters: (await h.root.db.select().from(characterStats).orderBy(characterStats.characterId)).map(stable),
    days: (await h.root.db.select().from(dailyStats).where(eq(dailyStats.ownerId, h.owner.userId)).orderBy(dailyStats.bucketStart)).map(stable),
    models: (await h.root.db.select().from(modelStats).where(eq(modelStats.ownerId, h.owner.userId)).orderBy(modelStats.model)).map(stable),
  };
}

async function selected(h: ChatRoot): Promise<Pick<typeof messageVariants.$inferSelect, "metadata" | "reasoning"> | undefined> {
  return await h.root.db
    .select({ metadata: messageVariants.metadata, reasoning: messageVariants.reasoning })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant")))
    .get();
}

async function reasoningRoom(windows: readonly number[]): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly turn: () => Promise<TurnOutcome>;
  }
> {
  await using construction = new AsyncDisposableStack();
  const clock = createFrozenClock();
  let reply = 0;
  let reasoningSeen: PromiseWithResolvers<void> | undefined;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      server: { clock },
      memoryEnabled: false,
      group: { output: "per-speaker", policy: "list" },
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
          return await corpus.execute(request);
        }
        const windowMs = windows[reply++];
        if (windowMs === undefined) {
          throw new Error("the physical reasoning replies are exhausted");
        }
        const seen = Promise.withResolvers<void>();
        reasoningSeen = seen;
        const onAbort = (): void => seen.reject(request.signal.reason);
        request.signal.addEventListener("abort", onAbort, { once: true });
        request.signal.throwIfAborted();
        const frames = [
          'data: {"choices":[{"delta":{"reasoning_content":"weighing the options"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"a considered reply"}}]}\n\n',
          `${terminalSseLine({ usage: { promptTokens: 10, completionTokens: 20 } })}\n\ndata: [DONE]\n\n`,
        ];
        let index = 0;
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream<Uint8Array>(
            {
              async pull(controller): Promise<void> {
                if (index === 1) {
                  // Advance only after the real reducer's durable reasoning delta has reached the live bus.
                  await seen.promise;
                  clock.advance(windowMs);
                }
                const frame = frames[index++];
                if (frame === undefined) {
                  request.signal.removeEventListener("abort", onAbort);
                  controller.close();
                } else {
                  controller.enqueue(encoder.encode(frame));
                }
              },
              cancel(): void {
                request.signal.removeEventListener("abort", onAbort);
                seen.resolve();
              },
            },
            { highWaterMark: 0 },
          ),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    }),
  );
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId === h.chatId && event.type === "delta" && event.delta.kind === "reasoning") {
      reasoningSeen?.resolve();
    }
  });
  construction.defer(unsubscribe);
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, reasoning: { mode: "adaptive", enabled: true } },
      features: { detectServer: false, reasoningKeys: ["reasoning_content"] },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const turn = async (): Promise<TurnOutcome> => {
    const character = h.characters[0];
    if (character === undefined) {
      throw new Error("the real reasoning room has no seated character");
    }
    return await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  };
  const lifetime = construction.move();
  return { h, turn, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("new-slot assistant WITH reasoning: the live model reasoning column equals a canon rebuild", async () => {
  await using fixture = await reasoningRoom([400]);
  const outcome = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  const live = await rollups(fixture.h);
  await fixture.h.root.services.stats.reconcile(fixture.h.owner.userId);
  expect(await rollups(fixture.h)).toEqual(live);
  expect(live.owner).toMatchObject([{ reasoningGenerations: 1 }]);
  expect(live.models).toMatchObject([{ reasoningGenerations: 1 }]);
  expect(live.characters).toMatchObject([{ reasoningGenerations: 1 }]);
});

test("a real turn stamps gen bounds → owner/model gen-time > 0", async () => {
  await using fixture = await reasoningRoom([400]);
  const outcome = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  const live = await rollups(fixture.h);
  expect(live.owner[0]?.genTimeMs).toBeGreaterThan(0);
  expect(live.owner[0]?.genSamples).toBe(1);
  expect(live.models[0]?.genTimeMs).toBeGreaterThan(0);
});

test("a streamed reasoning turn persists metadata.reasoning_duration and both writers roll it into reasoning_ms", async () => {
  await using fixture = await reasoningRoom([400]);
  const outcome = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  expect(parseVariantMetadata((await selected(fixture.h))?.metadata)[VARIANT_METADATA_REASONING_MS_KEY]).toBe(400);
  const live = await rollups(fixture.h);
  expect(live.owner).toMatchObject([{ reasoningMs: 400 }]);
  expect(live.models).toMatchObject([{ reasoningMs: 400 }]);
  await fixture.h.root.services.stats.reconcile(fixture.h.owner.userId);
  const rebuilt = await rollups(fixture.h);
  expect(rebuilt).toEqual(live);
  expect(rebuilt.owner).toMatchObject([{ reasoningMs: 400 }]);
});

test("new-slot reasoning turn, then a reasoning continue: the row and the live rollup both settle on the continuation's window", async () => {
  await using fixture = await reasoningRoom([400, 150]);
  const initial = await fixture.turn();
  expect(initial.aborted).toBe(false);
  expect(initial.messages).toHaveLength(1);
  const source = initial.messages[0];
  if (source === undefined) {
    throw new Error("the actual reasoning turn committed no assistant");
  }
  const outcome = await fixture.h.root.services.chat.continueTurn({ principal: fixture.h.owner, chatId: fixture.h.chatId, messageId: source.id });
  expect(outcome.aborted).toBe(false);
  expect(parseVariantMetadata((await selected(fixture.h))?.metadata)[VARIANT_METADATA_REASONING_MS_KEY]).toBe(150);
  const live = await rollups(fixture.h);
  await fixture.h.root.services.stats.reconcile(fixture.h.owner.userId);
  const rebuilt = await rollups(fixture.h);
  expect(live.owner).toMatchObject([{ reasoningMs: 150 }]);
  expect(rebuilt.owner).toMatchObject([{ reasoningMs: 150 }]);
  expect(live.models[0]?.reasoningMs).toBe(rebuilt.models[0]?.reasoningMs);
  expect(rebuilt).toEqual(live);
});

test("native SDK provenance persists beside the actual reasoning window in one parsed sidecar", async () => {
  const spawn = createSdkProcessSpawner(new URL("./stats-sdk-physical.mjs", import.meta.url));
  let child: ReturnType<typeof spawn> | undefined;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused SDK stats HTTP reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      providerFetch: corpus.execute,
      server: {
        secretBoxKey: Buffer.alloc(32, 1),
        sdkSpawn: (options) => {
          child = spawn(options);
          return child;
        },
      },
    }),
  );
  const opening = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(opening.aborted).toBe(false);
  expect(opening.messages).toHaveLength(1);
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "claude-sub", key: "controlled-stats-native-sdk-token" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: STATS_SDK_MODEL,
    allowBackground: true,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "The native stats ledger begins." });
  let reasoningEvents = 0;
  construction.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId && event.type === "delta" && event.delta.kind === "reasoning") {
        reasoningEvents += 1;
        h.root.clock.advance(400);
        if (child === undefined || !child.kill("SIGUSR2")) {
          throw new Error("the controlled native stats child is unavailable at its reasoning boundary");
        }
      }
    }),
  );
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: STATS_SDK_REPLY, reasoning: STATS_SDK_THINKING }]);
  expect(reasoningEvents).toBe(1);
  const rows = await captureSdkSessionRows(h.root.db, h.chatId, connection.id);
  expect(rows).toHaveLength(1);
  const nativeVariantId = outcome.messages[0]?.selectedVariantId;
  if (nativeVariantId === undefined || nativeVariantId === null) {
    throw new Error("the actual native stats reply has no selected variant");
  }
  const nativeVariant = await h.root.db
    .select({ metadata: messageVariants.metadata })
    .from(messageVariants)
    .where(eq(messageVariants.id, nativeVariantId))
    .get();
  const sidecar = parseVariantMetadata(nativeVariant?.metadata);
  expect(sidecar).toMatchObject({
    [VARIANT_METADATA_REASONING_MS_KEY]: 400,
    providerMetadata: { provider: "claude-sub", warmSpareClaimed: true, sdkSessionId: rows[0]?.sdkSessionId, cacheCreation1hTokens: STATS_SDK_CACHE_1H },
  });
  const arm = sidecar.providerMetadata;
  expect(arm !== undefined && arm.provider === "claude-sub" && arm.warmSpareClaimed).toBe(true);
});
