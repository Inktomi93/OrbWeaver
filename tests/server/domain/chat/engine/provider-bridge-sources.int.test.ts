// @subject packages/server/src/domain/chat/engine/provider-bridge.ts
// The bridge is the ONE hop from an infra `ChatResult` to the chat domain's terminal `final` chunk. A field the
// result carries and this seam forgets dies with the request, so the citations the fold recorded are asserted
// HERE, on the economics the engine writes: the source list arrives, and a result with none leaves the key off
// (the same spread-if-present discipline the field has at every hop).
import type { ChatResult } from "@orb/inference";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRunChatTurnBridge } from "@orb/server/domain/chat";
import { makeGenerationCapability, testModelId, testProviderId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeResolvedSecret } from "@orb/testkit/node/composed";
import { makeResolved } from "@orb/testkit/node/helpers";
import { toChatResult } from "#inference/backends/v4/result.ts";
import { drainStream } from "#inference/backends/v4/stream.ts";
import type { TurnEconomics, TurnRequest, TurnStreamChunk } from "#server/domain/chat/contract/results.ts";

type StreamPart = Parameters<typeof drainStream>[0] extends ReadableStream<infer T> ? T : never;
type ResultContext = Parameters<typeof toChatResult>[1];

const FINISH = {
  type: "finish",
  finishReason: { unified: "stop", raw: "end_turn" },
  usage: {
    inputTokens: { total: 11, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 4, text: 4, reasoning: undefined },
  },
} as const;

// The result is built by the REAL fold, never hand-assembled: the bridge's input is what a wire actually produces.
async function citedResult(parts: readonly StreamPart[]): Promise<ChatResult> {
  const stream = new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
  const context: ResultContext = {
    model: testModelId("openrouter/test-model"),
    providerId: testProviderId("openrouter"),
    providerMetadataKey: "openrouter",
    generation: makeGenerationCapability(),
    maxOutputTokens: 1024,
    startedAt: 0,
    firstDeltaAt: undefined,
    now: 1,
    measuredCost: null,
    pricing: undefined,
    generationId: null,
    appliedEffort: null,
    rateLimit: null,
    warnings: [],
  };
  return toChatResult(await drainStream(stream, { label: "fixture" }), context);
}

// The turn request is built from a REAL resolved connection (the production credential owner mints the secret),
// so `toChatRequest` runs its real wire decision rather than accepting a hand-shaped fixture.
async function turnRequestOf(harness: ServerTestHarness): Promise<TurnRequest> {
  const credential = await makeResolvedSecret(harness, {
    ownerId: harness.ownerId,
    credentialId: null,
    providerId: testProviderId("custom-openai"),
  });
  return {
    connection: makeResolved({ credential, providerId: testProviderId("custom-openai") }),
    chatId: castId<ChatId>("chat_bridge_sources"),
    prompt: {
      static: "system",
      dynamic: "",
      afterHistory: [],
      sendHistory: true,
      trace: {
        staticSections: [],
        dynamicSections: [],
        worldInfoIncluded: 0,
        worldInfoDropped: [],
        worldInfoActivated: [],
        matchedKeys: [],
        compactSummaryIncluded: false,
        memoryIncluded: false,
        memoryRecall: null,
        databankIncluded: false,
        guidedInstructionIncluded: false,
        staticCacheBusters: [],
        chatInjectionsIncluded: 0,
        afterHistorySections: [],
      },
    },
    history: [{ role: "user", content: [{ type: "text", text: "what is new?" }] }],
    intent: {},
    kind: "send",
    cacheBreakpointFromEnd: null,
    signal: new AbortController().signal,
  };
}

async function finalEconomicsOf(req: TurnRequest, result: ChatResult): Promise<TurnEconomics> {
  const chunks: TurnStreamChunk[] = [];
  for await (const chunk of createRunChatTurnBridge({ runChatTurn: async () => result })(req)) {
    chunks.push(chunk);
  }
  const final = chunks.at(-1);
  if (final?.kind !== "final") {
    throw new Error("the bridge did not end on a final chunk");
  }
  return final.economics;
}

test("the final chunk's economics carry the sources off the chat result", async ({ harness }) => {
  const result = await citedResult([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Alpha beta." },
    { type: "text-end", id: "0" },
    {
      type: "source",
      sourceType: "url",
      id: "https://example.test/one",
      url: "https://example.test/one",
      title: "One",
      providerMetadata: { openrouter: { content: "the passage", startIndex: 6, endIndex: 10 } },
    },
    FINISH,
  ]);
  const economics = await finalEconomicsOf(await turnRequestOf(harness), result);
  expect(economics.sources).toEqual([{ url: "https://example.test/one", title: "One", atChars: 6, endChars: 10, citedText: "the passage" }]);
});

// The positive control above is what makes this absence mean "the spread skipped the key": the same bridge, the
// same fixture builder, one field fewer.
test("a turn that cited nothing leaves the economics' sources key off", async ({ harness }) => {
  const result = await citedResult([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Alpha beta." },
    { type: "text-end", id: "0" },
    FINISH,
  ]);
  const economics = await finalEconomicsOf(await turnRequestOf(harness), result);
  expect(Object.hasOwn(economics, "sources")).toBe(false);
});
