// @subject packages/server/src/domain/chat/service.ts
// Physical FIFO replies and actual durable outcomes qualify the production root, not a replacement domain façade.

import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import { jsonValueSchema } from "@orb/kit/json";
import { createControlledTimers, createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";
import { assertEventSequence } from "@orb/testkit/node/helpers";
import { ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";

async function room(
  replies: readonly string[],
  names: readonly string[] = ["Aria"],
  faultStatus?: number,
  server?: Parameters<typeof createChatRoot>[0]["server"],
): Promise<ChatRoot> {
  let next = 0;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused FIFO fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => {
      const text = replies[next++];
      if (text === undefined) {
        throw new Error("the physical root reply plan is exhausted");
      }
      return { text, toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } };
    },
  });
  return await createChatRoot({
    ...(server === undefined ? {} : { server }),
    memoryEnabled: false,
    group: { output: "per-speaker", policy: "list" },
    characters: names.map((name) => createCharacterSchema.parse({ handle: name.toLowerCase(), name, description: `${name}'s root witness card.` })),
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (faultStatus !== undefined && request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
        return Response.json(
          { error: { message: "controlled physical provider refusal", type: faultStatus === 429 ? "rate_limit_error" : "server_error" } },
          { status: faultStatus, headers: { "retry-after": "0" } },
        );
      }
      return await physical.execute(request);
    },
  });
}

async function withRefusal(status: number, prove: (h: ChatRoot, send: () => Promise<TurnOutcome>) => Promise<void>): Promise<void> {
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  let nextTimer = Promise.withResolvers<number>();
  let lastScheduledAttempt = 0;
  let root: ChatRoot | undefined;
  await using h = await room([], ["Aria"], status, {
    clock,
    timers: {
      ...timers,
      timeout: (callback, ms) => {
        const cancel = timers.timeout(callback, ms);
        const attempts =
          root?.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")).length ?? 0;
        if (attempts > lastScheduledAttempt) {
          lastScheduledAttempt = attempts;
          nextTimer.resolve(ms);
        }
        return cancel;
      },
    },
  });
  root = h;
  const send = async (): Promise<TurnOutcome> => {
    const completed = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" }).then(
      (value) => ({ status: "success" as const, value }),
      (error: Error) => ({ status: "error" as const, error }),
    );
    for (;;) {
      const event = await Promise.race([completed, nextTimer.promise.then((ms) => ({ status: "timer" as const, ms }))]);
      if (event.status === "error") {
        throw event.error;
      }
      if (event.status === "success") {
        return event.value;
      }
      nextTimer = Promise.withResolvers<number>();
      timers.advance(event.ms);
    }
  };
  await prove(h, send);
}

async function systemPrefixes(h: ChatRoot): Promise<string[]> {
  return await Promise.all(
    h.requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))
      .map(async (request) => {
        const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
        if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
          throw new Error("the physical root request has no message list");
        }
        const first = body["messages"][0];
        if (first === null || typeof first !== "object" || Array.isArray(first) || first["role"] !== "system" || typeof first["content"] !== "string") {
          throw new Error("the physical root request has no leading text system prefix");
        }
        return first["content"];
      }),
  );
}

test("commits the user row + the assistant turn; emits the lifecycle", async () => {
  await using h = await room(["Hi there"]);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(2);
  expect(outcome.messages[0]).toMatchObject({ role: "user", content: "hello", authorUserId: h.owner.userId });
  expect(outcome.messages[1]).toMatchObject({ role: "assistant", content: "Hi there" });
  const canon = await readRoomCanon(h.root, h.owner, h.chatId);
  expect(canon.map(({ seq }) => seq)).toEqual([1, 2]);
  expect(canon.map(({ role }) => role)).toEqual(["user", "assistant"]);
  const events = await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId });
  assertEventSequence(
    events.map(({ event }) => event),
    ["turnStarted", "messageCommitted", "turnCompleted"],
  );
});

test("a list-policy 2-character room dequeues one scripted reply per speaker, in order", async () => {
  await using h = await room(["from aria", "from bryn"], ["Aria", "Bryn"]);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi all" });
  const assistants = outcome.messages.filter(({ role }) => role === "assistant");
  expect(assistants).toHaveLength(2);
  expect(assistants.map(({ characterId }) => characterId)).toEqual(h.characters.map(({ id }) => id));
  expect(assistants.map(({ content }) => content)).toEqual(["from aria", "from bryn"]);
});

test("the static system prefix is byte-stable across turns and the token totals sum to the physical economics", async () => {
  await using h = await room(["one", "two"]);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "first" })).aborted).toBe(false);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "second" })).aborted).toBe(false);
  const prefixes = await systemPrefixes(h);
  expect(prefixes).toHaveLength(2);
  expect(prefixes[0]?.length).toBeGreaterThan(0);
  expect(prefixes[1]).toBe(prefixes[0]);
  expect(await h.root.services.stats.overview(h.owner.userId)).toMatchObject({ tokensIn: 8, tokensOut: 4 });
});

test("a physical provider server refusal rejects with the typed provider failure", async () => {
  await withRefusal(500, async (h, send) => {
    await expect(send()).toThrowProviderError("server");
    expect((await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).map(({ event }) => event.type)).toContain("turnAborted");
  });
});

test("a physical rate-limit refusal rejects with kind:'rate_limit'", async () => {
  await withRefusal(429, async (_h, send) => {
    await expect(send()).toThrowProviderError("rate_limit");
  });
});

test("a stranger's send is refused leak-free (not a member)", async () => {
  await using h = await room(["Hi there"]);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  await expect(h.root.services.chat.send({ principal: stranger, chatId: h.chatId, content: "hi" })).rejects.toBeInstanceOf(ChatNotFoundError);
});
