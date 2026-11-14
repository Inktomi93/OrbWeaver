// @subject packages/server/src/domain/chat/engine/provider-wait.ts
// A turn whose provider answers nothing past the notice delay tells the room it is waiting, once, and is never ended
// for it: a large local model's cold start keeps its turn inside the idle window, then streams as usual.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { PROVIDER_WAIT_NOTICE_MS } from "#server/domain/chat/engine/provider-wait.ts";

const REPLY = "The engine hums awake.";
// A large local model loading from disk: minutes, not seconds, and still inside the idle window.
const COLD_START_MS = 120_000;
// Under the case budget, so a turn that never settles fails here with its own message.
const POLL = { timeout: 3000, interval: 10 } as const;
// One step of the root's scheduler while the released turn settles.
const TICK_MS = 1000;

type Observed = Extract<ChatBusEvent, { type: "providerWait" | "delta" | "turnAborted" }>;

test("a slow first token is named once and waited out, never ended early", async () => {
  using plan = finiteReplies("cold start", [REPLY]);
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: plan.take(), toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } }),
  });
  const dispatched = Promise.withResolvers<void>();
  const loaded = Promise.withResolvers<void>();
  let dispatches = 0;
  await using h = await createChatRoot({
    memoryEnabled: false,
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
        dispatches += 1;
        dispatched.resolve();
        await loaded.promise;
      }
      return await corpus.execute(request);
    },
  });
  const seen: Observed[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId && (event.type === "providerWait" || event.type === "delta" || event.type === "turnAborted")) {
        seen.push(event);
      }
    }),
  );

  let outcome: Awaited<ReturnType<typeof h.root.services.chat.send>> | undefined;
  const turn = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Wake up." }).then((settled) => {
    outcome = settled;
  });
  await dispatched.promise;
  h.root.timers.advance(PROVIDER_WAIT_NOTICE_MS - 1);
  expect(seen).toEqual([]);
  h.root.timers.advance(1);
  await expect.poll(() => seen.map((event) => event.type), POLL).toEqual(["providerWait"]);
  const [waiting] = seen;
  expect(waiting).toMatchObject({ type: "providerWait", phase: "waiting" });

  h.root.timers.advance(COLD_START_MS);
  expect(seen).toEqual([waiting]);

  loaded.resolve();
  // Tick the root's scheduler while the turn finishes, so a retry or backoff a stall bound armed would run rather than hang.
  await expect
    .poll(() => {
      h.root.timers.advance(TICK_MS);
      return outcome;
    }, POLL)
    .toMatchObject({ aborted: false });
  await turn;
  // The one request the model was loading for is the one that answered: nothing ended it and sent another.
  expect(dispatches).toBe(1);
  // `started` lands once, ahead of the first token, and nothing ended the turn.
  const [first, second, third] = seen;
  expect([first, second]).toEqual([waiting, { type: "providerWait", chatId: h.chatId, turnId: waiting?.turnId, phase: "started" }]);
  expect(third).toMatchObject({ type: "delta", turnId: waiting?.turnId });
  expect(seen.filter((event) => event.type === "providerWait")).toHaveLength(2);
  expect(seen.filter((event) => event.type === "turnAborted")).toEqual([]);
  await h.root.settleBackground();
});

test("a provider that answers before the notice delay names no wait", async () => {
  using plan = finiteReplies("warm provider", [REPLY]);
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: plan.take(), toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } }),
  });
  await using h = await createChatRoot({ memoryEnabled: false, providerFetch: corpus.execute });
  const waits: ChatBusEvent[] = [];
  const deltas: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId && event.type === "providerWait") {
        waits.push(event);
      }
      if (event.chatId === h.chatId && event.type === "delta") {
        deltas.push(event);
      }
    }),
  );
  expect(await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Wake up." })).toMatchObject({ aborted: false });
  h.root.timers.advance(PROVIDER_WAIT_NOTICE_MS);
  // The positive control: the turn streamed through the same subscription that saw no wait.
  expect(deltas.length).toBeGreaterThan(0);
  expect(waits).toEqual([]);
  await h.root.settleBackground();
});
