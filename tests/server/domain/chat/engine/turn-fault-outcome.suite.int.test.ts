// @subject packages/server/src/domain/chat/engine/engine.ts
// Read outcomes through the authenticated debug door after real native execution and physical failures.
import type { TurnOutcome } from "@orb/contracts/chat";
import { chatEvents, messageVariants } from "@orb/db";
import { ProviderError } from "@orb/inference";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { createControlledTimers, createFrozenClock, createSeededIds } from "@orb/testkit/iso";
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
import { eq, sql } from "drizzle-orm";
import { sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_MODEL } from "./engine-sdk-physical.mjs";

const DEBUG_TOKEN = "controlled-engine-outcome-debug-token";
const outcomeIds = createSeededIds();
const outcomeServer = { ids: outcomeIds, wireCapture: true, debugToken: DEBUG_TOKEN } as const;

async function outcomes(h: ChatRoot): Promise<JsonValue[]> {
  const response = await h.root.http.request(`/api/_debug/wire/outcomes?chatId=${h.chatId}`, {
    headers: { "x-debug-token": DEBUG_TOKEN },
  });
  expect(response.status).toBe(200);
  const body = jsonValueSchema.parse(await response.json());
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["outcomes"])) {
    throw new Error("the real debug outcome response has no outcome list");
  }
  expect(body["enabled"]).toBe(true);
  expect(body["count"]).toBe(body["outcomes"].length);
  return body["outcomes"];
}

test("a provider fault records disposition:error with the native provider terminalReason and requested route", async () => {
  await using fixture = await sdkEngineRoom({ history: 2, policy: { foreground: "fail" }, server: outcomeServer });
  await expect(fixture.turn({ effort: "high" })).toThrowProviderError("server");
  expect(await outcomes(fixture.h)).toEqual([
    expect.objectContaining({
      chatId: fixture.h.chatId,
      disposition: "error",
      terminalReason: "api_error",
      contentChars: 0,
      model: ENGINE_SDK_MODEL,
      reasoningEffort: "high",
      tokensOut: null,
      modelCalls: null,
      maxOutputTokens: null,
    }),
  ]);
  expect(fixture.receipts.filter(({ marker }) => !marker)).toHaveLength(1);
});

test("a real database refusal still records the non-provider lifecycle classification", async () => {
  await using fixture = await sdkEngineRoom({ history: 2, server: outcomeServer });
  await fixture.h.root.db.run(
    sql`CREATE TEMP TRIGGER refuse_fault_variant BEFORE INSERT ON ${messageVariants} BEGIN SELECT RAISE(ABORT, 'controlled outcome canon refusal'); END`,
  );
  await expect(fixture.turn()).rejects.toThrow("controlled outcome canon refusal");
  expect((await outcomes(fixture.h))[0]).toMatchObject({ disposition: "error", terminalReason: "error" });
  expect(fixture.receipts.filter(({ marker }) => !marker)).toHaveLength(1);
});

async function withHttpRoom(refuse: boolean, prove: (h: ChatRoot, routed: () => Promise<TurnOutcome>) => Promise<void>): Promise<void> {
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  let nextTimer = Promise.withResolvers<number>();
  let lastScheduledAttempt = 0;
  let attempts = 0;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A real warning-bearing reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    group: { output: "per-speaker", policy: "list" },
    server: {
      ...outcomeServer,
      clock,
      timers: {
        ...timers,
        timeout: (callback, ms) => {
          const cancel = timers.timeout(callback, ms);
          if (attempts > lastScheduledAttempt) {
            lastScheduledAttempt = attempts;
            nextTimer.resolve(ms);
          }
          return cancel;
        },
      },
    },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (refuse && request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
        attempts += 1;
        return Response.json(
          { error: { message: "controlled physical rate limit", type: "rate_limit_error" } },
          { status: 429, headers: { "retry-after": "0" } },
        );
      }
      return await physical.execute(request);
    },
  });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, sampling: { topK: undefined } },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const routed = async (): Promise<TurnOutcome> => {
    const completed = h.caller.chat
      .send({ chatId: h.chatId, content: "Report the actual provider outcome.", timeZone: UTC_TIME_ZONE, intent: { topK: 5 } })
      .then(
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
  await prove(h, routed);
}

// The real wrapper is transport-owned, after engine classification; no hypothetical pre-engine wrapper is manufactured.
test("a routed physical 429 retains ProviderError as the actual TRPCError cause and records rate_limit", async () => {
  await withHttpRoom(true, async (h, routed) => {
    const running = routed();
    const settled = Promise.allSettled([running]);
    await expect(running).toThrowTRPCError("TOO_MANY_REQUESTS");
    const result = await settled;
    expect(result[0].status).toBe("rejected");
    const rejected = result[0];
    if (rejected.status !== "rejected") {
      throw new Error("the physical 429 unexpectedly resolved");
    }
    expect(rejected.reason).toMatchObject({ name: "TRPCError", code: "TOO_MANY_REQUESTS", cause: expect.any(ProviderError) });
    expect(rejected.reason.cause).toMatchObject({ kind: "rate_limit" });
    expect(await outcomes(h)).toEqual([expect.objectContaining({ disposition: "error", terminalReason: "rate_limit" })]);
  });
});

test("a physical caller cancellation records user, never a provider fault", async () => {
  await using fixture = await sdkEngineRoom({ history: 2, policy: { foreground: "hold" }, server: outcomeServer });
  const running = fixture.turn();
  const settled = Promise.allSettled([running]);
  try {
    await expect.poll(() => fixture.held.size).toBe(1);
    await fixture.h.root.services.chat.abort({ principal: fixture.h.owner, chatId: fixture.h.chatId });
    expect(await running).toMatchObject({ aborted: true, abortReason: "user" });
    await expect.poll(() => fixture.held.size).toBe(0);
    expect(await outcomes(fixture.h)).toEqual([expect.objectContaining({ disposition: "user", terminalReason: "aborted" })]);
  } finally {
    fixture.release();
    await settled;
  }
});

test("the outcome row is a passenger: the public service rethrows the actual observed provider error by identity", async () => {
  let observed: Error | undefined;
  await using fixture = await sdkEngineRoom({
    history: 2,
    policy: { foreground: "fail" },
    server: {
      ...outcomeServer,
      runtimeSpan: async (name, operation) => {
        try {
          return await operation();
        } catch (error) {
          if (name === "provider.chat" && error instanceof Error) {
            observed = error;
          }
          throw error;
        }
      },
    },
  });
  const [result] = await Promise.allSettled([fixture.turn()]);
  expect(observed).toBeInstanceOf(ProviderError);
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") {
    throw new Error("the actual native error unexpectedly resolved");
  }
  expect(result.reason).toBe(observed);
  expect(await outcomes(fixture.h)).toHaveLength(1);
});

test("a completed native turn keeps raw warning code and operator prose while its room warning is revoiced", async () => {
  await withHttpRoom(false, async (h, routed) => {
    expect((await routed()).aborted).toBe(false);
    const raw = "topK ignored: model does not expose a topK range";
    expect(await outcomes(h)).toEqual([
      expect.objectContaining({ disposition: "completed", warnings: expect.arrayContaining([{ code: "sampling_knob_dropped", message: raw }]) }),
    ]);
    const warnings = (await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId))).filter(({ payload }) => payload.type === "warning");
    expect(warnings.map(({ payload }) => payload)).toContainEqual(expect.objectContaining({ code: "settings_adjusted" }));
    expect(JSON.stringify(warnings)).not.toContain(raw);
  });
});
