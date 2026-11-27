// @subject packages/inference/src/backends/http/error-classify.ts
// A turn the provider rate-limited fails as a provider rate-limit error that carries the reset moment the provider stated.

import { builtinProvider, modelIdSchema } from "@orb/contracts/inference";
import { ProviderError } from "@orb/inference";
import { createControlledTimers, createFrozenClock, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  createChatRoot,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
} from "@orb/testkit/node/composed";

const MODEL = modelIdSchema.parse("claude-opus-5");
const RETRY_AFTER_SECONDS = 3600;
const MS_PER_SECOND = 1000;
// The retry loop's longest single backoff; each tick moves the controlled timers past it so every retry fires.
const BACKOFF_TICK_MS = 10_000;

test("a rate-limited turn fails as a provider rate-limit error that states when the provider lifts the limit", async () => {
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("Anthropic provider has no endpoint");
  }
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  const provider = createCorpusProviderExecution({
    baseUrl: endpoint,
    modelIds: [MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    images: [],
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    anthropicMessages: () => [],
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY, networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) }, clock, timers },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST" && new URL(request.url).pathname === "/v1/messages") {
        return Response.json(
          { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
          { status: 429, headers: { "retry-after": String(RETRY_AFTER_SECONDS) } },
        );
      }
      return await provider.execute(request);
    },
  });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "anthropic", key: "controlled-corpus-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "anthropic",
    credentialId: credential.id,
    baseUrl: null,
    model: MODEL,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });

  const settled = h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } }).then(
    () => ({ failure: null }),
    (error: unknown) => ({ failure: error }),
  );
  const tick = (): Promise<null> => new Promise((resolve) => setImmediate(() => resolve(null)));
  let outcome = await Promise.race([settled, tick()]);
  while (outcome === null) {
    timers.advance(BACKOFF_TICK_MS);
    outcome = await Promise.race([settled, tick()]);
  }
  const { failure } = outcome;

  expect(failure).toBeInstanceOf(ProviderError);
  const rateLimited = failure instanceof ProviderError ? failure : null;
  expect(rateLimited?.kind).toBe("rate_limit");
  // The provider answered `retry-after` on its last attempt, so the stated reset is that long after the clock then.
  expect(rateLimited?.resetsAt).toBeGreaterThanOrEqual(clock.frozenAt + RETRY_AFTER_SECONDS * MS_PER_SECOND);
});
