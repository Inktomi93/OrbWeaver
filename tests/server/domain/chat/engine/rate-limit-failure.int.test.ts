// @subject packages/server/src/transport/trpc/error-mapping.ts
// A turn the provider rate-limited fails as a modelled provider error, and the wire detail the transport derives from it
// carries the reset moment the provider stated.

import { PROVIDER_FAILURE_REASON_PREFIX, RATE_LIMIT_RESETS_AT_DETAIL_KEY } from "@orb/contracts/chat";
import { builtinProvider, modelIdSchema } from "@orb/contracts/inference";
import { ProviderError } from "@orb/inference";
import { appRouter, classifyDomainError } from "@orb/server/transport/trpc";
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
// tRPC's JSON-RPC code for TOO_MANY_REQUESTS, the number the error shape carries.
const TOO_MANY_REQUESTS_RPC_CODE = -32_029;

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

  const mapped = classifyDomainError(failure);
  if (mapped === null) {
    throw new Error("The rate-limited turn did not classify as a modelled failure");
  }
  expect(mapped.code).toBe("TOO_MANY_REQUESTS");
  expect(mapped.cause).toBeInstanceOf(ProviderError);
  // The provider answered `retry-after` on its last attempt, so the stated reset is that long after the clock then.
  const resetsAt = mapped.cause instanceof ProviderError ? mapped.cause.resetsAt : undefined;
  expect(resetsAt).toBeGreaterThanOrEqual(clock.frozenAt + RETRY_AFTER_SECONDS * MS_PER_SECOND);
  // The wire: the production formatter rides the failure's reason and, for a rate limit, the stated reset.
  const formatted = appRouter._def._config.errorFormatter({
    error: mapped,
    type: "unknown",
    path: "chat.generate",
    input: undefined,
    ctx: undefined,
    shape: { message: mapped.message, code: TOO_MANY_REQUESTS_RPC_CODE, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } },
  });
  expect(formatted.data.reason).toBe(`${PROVIDER_FAILURE_REASON_PREFIX}rate_limit`);
  expect(formatted.data.detail).toEqual({ [RATE_LIMIT_RESETS_AT_DETAIL_KEY]: resetsAt });
});
