// backends/openai-compat/chat — the openai-compat wire's turn on both dialects. The load-bearing pin is the
// two-leg tool loop through the OPENROUTER transport (audit A1/H4): leg 1 streams `reasoning_details` with a
// signature, and leg 2's wire body must carry those details back on the assistant row — the replay contract
// the OR provider implements for Anthropic, Gemini (thought signatures) and OpenAI (encrypted reasoning)
// alike, and which it silently strips when an entry arrives unsigned.
//
// Also pinned: H1(b) verbosity rides `extraBody` on the OR route when the capability advertises it (measured
// 2026-09-19: OR forwards it upstream), and E2 — a provider id with a `-` keys `providerOptions` by its camel
// form, so the SDK stops pushing a deprecation warning on every single call.
//
// The RECORD-TRUTH pins (audit B1 · B6 · B7): what the record says is checked against the BYTES the wire
// carried. B1: `appliedEffort` is read back off the built options — a row whose `features.effort: "none"` spells
// no `reasoning_effort` records `null` while the funnel still resolved the ask (the audit's recorded lie); a
// row that spells it records the word the body carries. B6: the OpenAI-style rate-limit headers on the
// response become `rateLimit`. B7: the endpoint's own response id is the row's `generationId`.

import type { EFFORT_SPELLINGS, PromptCacheSettings, ProviderId } from "@orb/contracts/inference";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { createInferenceRuntime } from "@orb/inference";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { runOpenAiCompatChatTurn } from "../../../../packages/inference/src/backends/openai-compat/chat.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { ChatDeltaSubscription, ChatResult, OpenAiCompatChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../support/inference-identities.ts";
import { wireSchema } from "../../../support/wire-ready.ts";
import { openRouterCatalogFetch } from "../../_openrouter-catalog.ts";
import { fakeApiKeySecret, fakeConnection, fakeDeps, fakeResolved, memoryStores, memoryTokenLexicon, newUserId } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, openRouterReasoningToolStream, scriptedSseFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const REASONING = "Paris weather needs the tool.";
const SIGNATURE = "sig-anthropic-claude-v1";

const APP = { name: "orbweaver-test", url: "http://localhost:0" };

test.each(["credential", "header", "body"] as const)("OpenRouter source generation identity cannot expose a reflected %s secret", async (source) => {
  const literals = { credential: "opaque-cache-credential", header: "opaque-cache-header", body: 'opaque-cache-body-"quoted"' };
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "openai/gpt-6-sol",
    capability: generationCapability(),
    secret: fakeApiKeySecret(literals.credential),
    transport: { headers: { "X-Custom-Secret": literals.header }, includeBody: { api_key: literals.body } },
  });
  const result = await runOpenAiCompatChatTurn(
    orRequest({ connection, tools: undefined }),
    turnDeps(
      scriptedSseFetch([openAiTextStream("safe reply")], [], {
        "x-openrouter-cache-status": "MISS",
        "x-openrouter-cache-source-id": `gen:${literals[source]}:tail`,
        "x-openrouter-cache-age": "3",
        "x-openrouter-cache-ttl": "60",
      }),
    ),
  );
  expect(result.usage.responseCache).toEqual({ status: "miss", ageSeconds: 3, ttlSeconds: 60, sourceGenerationId: null });
  expect(JSON.stringify(result)).not.toContain(literals[source]);
  expect(result.reply).toBe("safe reply");
});

test("native legacy cache retention and chat affinity survive SDK conversion without overruling configured body", async () => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const { capability } = synthesizeCapability("generation", "openai", {
    curated: curatedRows({ model: "gpt-5.5", providerId: castId<ProviderId>("openai"), wire: "openai-compat", api: "chat-completions" }),
  });
  const connection = fakeResolved({
    task: "chat",
    providerId: "openai",
    model: "gpt-5.5",
    capability,
    promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false, retention: "24h" },
  });
  const req = orRequest({ connection, chatId, tools: undefined });
  expect(await sentBody(req)).toMatchObject({ prompt_cache_retention: "24h", prompt_cache_key: chatId });
  expect(await sentBody({ ...req, connection: { ...connection, extras: { prompt_cache_key: "configured-key" } } })).toHaveProperty(
    "prompt_cache_key",
    "configured-key",
  );
  const excluded = await sentBody({ ...req, connection: { ...connection, transport: { excludeBody: ["prompt_cache_key", "prompt_cache_retention"] } } });
  expect(excluded).not.toHaveProperty("prompt_cache_key");
  expect(excluded).not.toHaveProperty("prompt_cache_retention");
  const inherited = await sentBody({ ...req, connection: { ...connection, promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false } } });
  expect(inherited).not.toHaveProperty("prompt_cache_retention");
  const configured = await sentBody({ ...req, connection: { ...connection, extras: { prompt_cache_retention: "in_memory" } } });
  expect(configured).toHaveProperty("prompt_cache_retention", "in_memory");
  for (const providerId of ["openrouter", "custom-openai"] as const) {
    const model = providerId === "openrouter" ? "openai/gpt-5.5" : "gpt-5.5";
    const unsupportedCapability = synthesizeCapability("generation", "openai", {
      curated: curatedRows({ model, providerId: castId<ProviderId>(providerId), wire: "openai-compat", api: "chat-completions" }),
    }).capability;
    const unsupported = await sentBody({
      ...req,
      connection: fakeResolved({ ...connection, providerId, model, capability: unsupportedCapability, secret: fakeApiKeySecret("test-key") }),
    });
    expect(unsupported).not.toHaveProperty("prompt_cache_retention");
    expect(unsupported).not.toHaveProperty("prompt_cache_key");
  }
});

test("OpenRouter response replay is explicitly off unless the connection opts in", async () => {
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(orRequest(), turnDeps(scriptedSseFetch([openAiTextStream("A fresh answer.")], recorded)));
  expect(recorded[0]?.headers?.["x-openrouter-cache"]).toBe("false");
});

test("OpenRouter preserves configured headers and intentional response-cache opt-in", async () => {
  const recorded: RecordedRequest[] = [];
  const req = orRequest();
  const connection = {
    ...req.connection,
    transport: { headers: { "X-Custom-Header": "configured", "X-OpenRouter-Cache": "true", "X-OpenRouter-Cache-TTL": "60" } },
  };
  await runOpenAiCompatChatTurn({ ...req, connection }, turnDeps(scriptedSseFetch([openAiTextStream("An answer.")], recorded)));
  expect(recorded[0]?.headers?.["x-custom-header"]).toBe("configured");
  expect(recorded[0]?.headers?.["x-openrouter-cache"]).toBe("true");
  expect(recorded[0]?.headers?.["x-openrouter-cache-ttl"]).toBe("60");
});

test("OpenRouter affinity defaults to this chat while explicit body, header and cache-key routing win", async () => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const req = orRequest({ chatId, onDelta: () => undefined });
  expect((await sentBody(req))["session_id"]).toBe(chatId);
  expect((await sentBody({ ...req, connection: { ...req.connection, extras: { session_id: "configured-session" } } }))["session_id"]).toBe(
    "configured-session",
  );
  for (const connection of [
    { ...req.connection, transport: { headers: { "X-Session-ID": "configured-header" } } },
    { ...req.connection, extras: { prompt_cache_key: "configured-cache-key" } },
  ]) {
    expect(await sentBody({ ...req, connection })).not.toHaveProperty("session_id");
  }
  expect(await sentBody(orRequest())).not.toHaveProperty("session_id");
});

test("OpenRouter typed replay controls override configured headers and fresh bypass does not clear", async () => {
  const req = orRequest();
  const connection = {
    ...req.connection,
    transport: { headers: { "X-OpenRouter-Cache": "true", "X-OpenRouter-Cache-TTL": "60", "X-Custom": "kept" } },
  };
  const recorded: RecordedRequest[] = [];
  const deps = turnDeps(
    scriptedSseFetch(
      Array.from({ length: 3 }, () => openAiTextStream("An answer.")),
      recorded,
    ),
  );
  await runOpenAiCompatChatTurn({ ...req, connection, params: { responseCache: { enabled: false } } }, deps);
  await runOpenAiCompatChatTurn(
    { ...req, connection, params: { responseCache: { enabled: false, ttlSeconds: 120 } }, responseCache: { enabled: true, ttlSeconds: 300, refresh: true } },
    deps,
  );
  await runOpenAiCompatChatTurn({ ...req, connection, params: { responseCache: { enabled: true } }, responseCache: { enabled: false } }, deps);
  expect(recorded[0]?.headers).toMatchObject({ "x-openrouter-cache": "false", "x-openrouter-cache-ttl": "60", "x-custom": "kept" });
  expect(recorded[1]?.headers).toMatchObject({ "x-openrouter-cache": "true", "x-openrouter-cache-ttl": "300", "x-openrouter-cache-clear": "true" });
  expect(recorded[2]?.headers?.["x-openrouter-cache"]).toBe("false");
  expect(recorded[2]?.headers).not.toHaveProperty("x-openrouter-cache-clear");
});

test("OpenRouter response HIT retains nonempty replay, fresh generation identity and measured free cost", async () => {
  const events = openAiTextStream("Replayed answer.").map((event) => ({
    ...event,
    data: { ...event.data, ...(event.data["usage"] === undefined ? {} : { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }) },
  }));
  const result = await runOpenAiCompatChatTurn(
    orRequest(),
    turnDeps(
      scriptedSseFetch([events], [], {
        "X-OpenRouter-Cache-Status": "HIT",
        "X-OpenRouter-Cache-Age": "12",
        "X-OpenRouter-Cache-TTL": "288",
        "X-OpenRouter-Cache-Source-Id": "gen-original",
      }),
    ),
  );
  expect(result.reply).toBe("Replayed answer.");
  expect(result.generationId).toBe("gen-leg2");
  expect(result.usage.responseCache).toEqual({ status: "hit", ageSeconds: 12, ttlSeconds: 288, sourceGenerationId: "gen-original" });
  expect(result.usage).toMatchObject({ costUsd: 0, costProvenance: "measured", costDetails: { totalUsd: 0 } });
  expect(result.usage).toMatchObject({ tokensIn: 0, tokensOut: 0 });
});

test("native and OpenRouter OpenAI explicit prefix controls survive the installed adapters", async () => {
  for (const providerId of ["openai", "openrouter"] as const) {
    const connection = fakeResolved({
      task: "chat",
      providerId,
      model: providerId === "openai" ? "gpt-5.6-sol" : "openai/gpt-5.6-sol",
      capability: generationCapability({
        turns: {
          assistantPrefill: false,
          midConversationSystem: true,
          historySystemRows: true,
          roleHandlingFloor: "none",
          explicitPromptCache: true,
          promptCacheFormat: "openai-breakpoint",
          cacheMinTokens: 1,
          cacheRetentionSeconds: 1800,
          providerImplicitPromptCache: true,
          disablesImplicitPromptCache: true,
        },
      }),
      secret: fakeApiKeySecret("fixture-key"),
      promptCache: { ...SHIPPED_PROMPT_CACHE, disableImplicit: true },
    });
    const req = orRequest({ connection, tools: undefined, systemPrompt: { static: "Stable prefix.", dynamic: "Dynamic tail." } });
    const explicit = await sentBody(req);
    expect(explicit["prompt_cache_options"], providerId).toEqual({ mode: "explicit", ttl: "30m" });
    expect(explicit["messages"], providerId).toMatchObject([
      { role: "system", content: [{ type: "text", text: "Stable prefix.", prompt_cache_breakpoint: { mode: "explicit" } }] },
      { role: "system", content: providerId === "openai" ? "Dynamic tail." : [{ type: "text", text: "Dynamic tail." }] },
      { role: "user", content: "What is the weather in Paris?" },
    ]);
    expect(JSON.stringify(explicit)).not.toContain("cache_control");
    const off = await sentBody({ ...req, connection: { ...connection, promptCache: { ...connection.promptCache, enabled: false, disableImplicit: true } } });
    expect(off["prompt_cache_options"]).toEqual({ mode: "explicit", ttl: "30m" });
    expect(JSON.stringify(off)).not.toContain("prompt_cache_breakpoint");
  }
});

test.for([
  { input: 19_182, read: 0, write: 19_158 },
  { input: 19_182, read: 19_158, write: 0 },
  { input: 19_209, read: 19_158, write: 28 },
])("native modern OpenAI cache controls preserve observed raw counts $write and price each axis", async ({ input, read, write }) => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openai",
    model: "gpt-6-sol",
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        promptCacheFormat: "openai-breakpoint",
        providerImplicitPromptCache: true,
        disablesImplicitPromptCache: true,
        cacheMinTokens: 1,
        cacheRetentionSeconds: 1800,
      },
    }),
    promptCache: { ...SHIPPED_PROMPT_CACHE, disableImplicit: true },
    declaredFeatures: { pricing: { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 } },
    secret: fakeApiKeySecret("fake-native-key"),
  });
  const stream = openAiTextStream("ORBIT").map((frame) => ({
    ...frame,
    data: {
      ...frame.data,
      ...(frame.data["usage"] === undefined
        ? {}
        : {
            usage: {
              prompt_tokens: input,
              completion_tokens: 4,
              total_tokens: input + 4,
              prompt_tokens_details: { cached_tokens: read, cache_write_tokens: write },
              completion_tokens_details: { reasoning_tokens: 0 },
            },
          }),
    },
  }));
  const requests: RecordedRequest[] = [];
  const observed: ChatResult[] = [];
  const turn = await runOpenAiCompatChatTurn(
    orRequest({
      connection,
      tools: undefined,
      params: {},
      onObservedResult: (result) => {
        observed.push(result);
        return Promise.resolve();
      },
    }),
    turnDeps(scriptedSseFetch([stream], requests)),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]?.body["prompt_cache_options"]).toEqual({ mode: "explicit", ttl: "30m" });
  expect(JSON.stringify(requests[0]?.body)).toContain("prompt_cache_breakpoint");
  expect(JSON.stringify(requests[0]?.body)).not.toContain("cache_control");
  expect(observed).toHaveLength(1);
  expect(observed[0]?.usage).toEqual(turn.usage);
  expect(turn.usage).toMatchObject({
    tokensIn: input,
    tokensOut: 4,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    reasoningTokens: 0,
    costProvenance: "estimated",
  });
  expect(turn.usage.costUsd).toBeCloseTo((input - read - write + read * 0.1 + write * 1.25 + 8) / 1_000_000, 12);
});

test.for(
  [true, false].flatMap((modern) => [undefined, null, -1, "invalid"].map((write) => ({ modern, write }))),
)("native OpenAI missing/invalid write $write respects modern applicability $modern and preserves sibling counts", async ({ modern, write }) => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openai",
    model: modern ? "gpt-6-sol" : "gpt-4.1",
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: modern,
        ...(modern ? { promptCacheFormat: "openai-breakpoint" } : {}),
      },
    }),
    declaredFeatures: { pricing: { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 } },
    secret: fakeApiKeySecret("fake-native-key"),
  });
  const stream = openAiTextStream("ORBIT").map((frame) => ({
    ...frame,
    data: {
      ...frame.data,
      ...(frame.data["usage"] === undefined
        ? {}
        : {
            usage: {
              prompt_tokens: 100,
              completion_tokens: 4,
              total_tokens: 104,
              prompt_tokens_details: { cached_tokens: 20, ...(write === undefined ? {} : { cache_write_tokens: write }) },
            },
          }),
    },
  }));
  const turn = await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined, params: {} }), turnDeps(scriptedSseFetch([stream], [])));
  expect(turn.usage).toMatchObject({
    tokensIn: 100,
    tokensOut: 4,
    cacheReadTokens: 20,
    cacheWriteTokens: modern ? null : 0,
    reasoningTokens: modern ? null : 0,
    costProvenance: modern ? "unrecorded" : "estimated",
  });
  expect(turn.usage.costUsd === null).toBe(modern);
  expect(turn.usage.costUsd ?? 0).toBeCloseTo(modern ? 0 : 0.000_09, 12);
});

test.for([
  true,
  false,
])("OpenRouter Gemini overlapping raw read/write counts retain measured price authority %s and decline an incompatible estimate", async (priced) => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "google/gemini-3.8-flash",
    capability: generationCapability(),
    declaredFeatures: { pricing: { inputPerMTok: 0.75, outputPerMTok: 3.75, cacheReadPerMTok: 0.075, cacheWritePerMTok: 0.9375 } },
    secret: fakeApiKeySecret("fake-or-key"),
  });
  const stream = openAiTextStream("ORBIT").map((frame) => ({
    ...frame,
    data: {
      ...frame.data,
      ...(frame.data["usage"] === undefined
        ? {}
        : {
            usage: {
              prompt_tokens: 24_344,
              completion_tokens: 1,
              total_tokens: 24_345,
              prompt_tokens_details: { cached_tokens: 24_327, cache_write_tokens: 24_327 },
              ...(priced
                ? {
                    cost: 0.002_854_65,
                    is_byok: false,
                    cost_details: {
                      upstream_inference_cost: 0.002_854_65,
                      upstream_inference_prompt_cost: 0.002_850_9,
                      upstream_inference_completions_cost: 0.000_003_75,
                    },
                  }
                : {}),
            },
          }),
    },
  }));
  const turn = await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined, params: {} }), turnDeps(scriptedSseFetch([stream], [])));
  expect(turn.usage).toMatchObject({
    tokensIn: 24_344,
    tokensOut: 1,
    cacheReadTokens: 24_327,
    cacheWriteTokens: 24_327,
    costUsd: priced ? 0.002_854_65 : null,
    costProvenance: priced ? "measured" : "unrecorded",
  });
  expect(turn.usage.costDetails).toEqual(priced ? { totalUsd: 0.002_854_65, promptUsd: 0.002_850_9, completionUsd: 0.000_003_75 } : null);
});

test.for([
  { cost: -1, upstream: 0.125, byok: false, known: null },
  { cost: 0.125, upstream: -1, byok: true, known: null },
  { cost: 0, upstream: 0, byok: true, known: 0 },
])("installed OR chat SDK heals optional price $cost/upstream $upstream without losing completed counts", async ({ cost, upstream, byok, known }) => {
  const stream = openAiTextStream("ORBIT").map((frame) => ({
    ...frame,
    data: {
      ...frame.data,
      ...(frame.data["usage"] === undefined
        ? {}
        : {
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
              cost,
              is_byok: byok,
              cost_details: { upstream_inference_cost: upstream },
            },
          }),
    },
  }));
  const requests: RecordedRequest[] = [];
  const observed: ChatResult[] = [];
  const turn = await runOpenAiCompatChatTurn(
    orRequest({
      tools: undefined,
      params: {},
      onObservedResult: (result): Promise<void> => {
        observed.push(result);
        return Promise.resolve();
      },
    }),
    turnDeps(scriptedSseFetch([stream], requests)),
  );
  expect(requests).toHaveLength(1);
  expect(observed).toHaveLength(1);
  expect(observed[0]?.usage).toMatchObject({ tokensIn: 10, tokensOut: 5, costUsd: known, costProvenance: known === null ? "unrecorded" : "measured" });
  expect(turn.usage.costUsd).toBe(known);
  expect(turn.usage.costDetails).toEqual(known === null ? null : { totalUsd: 0, upstreamUsd: 0, gatewayUsd: 0 });
});

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

function turnDeps(fetchImpl: typeof fetch): Parameters<typeof runOpenAiCompatChatTurn>[1] {
  return { now: () => NOW, log: silentLog(), transport: { fetch: fetchImpl, app: APP }, tokens: memoryTokenLexicon() };
}

type OpenAiCompatRequestOverrides = Partial<Omit<OpenAiCompatChatRequest, "chatId" | "onDelta">> & ChatDeltaSubscription;

function orRequest(overrides: OpenAiCompatRequestOverrides = {}): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const base = {
    api: "chat-completions",
    connection,
    params: { effort: "high" } satisfies UserIntent,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  } satisfies OpenAiCompatChatRequest;
  return { ...base, ...overrides };
}

function assistantRowOf(recorded: RecordedRequest): Record<string, unknown> {
  const messages = recorded.body["messages"];
  const row = Array.isArray(messages) ? messages.find((m: unknown) => (m as { role?: string }).role === "assistant") : undefined;
  return (row ?? {}) as Record<string, unknown>;
}

function warningCodes(turn: ChatResult): string[] {
  return turn.events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
}

test("the actual OpenRouter SDK body admits image detail only from connection capability", async () => {
  for (const admitted of [true, false]) {
    for (const detail of ["auto", "low", "high"] as const) {
      const recorded: RecordedRequest[] = [];
      const connection = fakeResolved({
        task: "chat",
        providerId: "openrouter",
        model: "openai/gpt-4.1",
        capability: generationCapability({ imageDetail: admitted }),
        secret: fakeApiKeySecret("sk-or-not-a-real-key"),
      });
      await runOpenAiCompatChatTurn(
        orRequest({
          connection,
          tools: undefined,
          attachmentQuality: { imageDetail: detail, videoMaxResolution: "720" },
          history: [
            {
              role: "user",
              content: [
                { type: "text", text: "Inspect the picture." },
                { type: "image", url: "data:image/png;base64,YQ==" },
              ],
            },
          ],
        }),
        turnDeps(scriptedSseFetch([openAiTextStream("A picture.")], recorded)),
      );
      expect(recorded).toHaveLength(1);
      expect(recorded[0]?.body["messages"]).toEqual([
        { role: "system", content: [{ type: "text", text: "You are a helpful assistant." }] },
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect the picture." },
            { type: "image_url", image_url: { url: "data:image/png;base64,YQ==", ...(admitted ? { detail } : {}) } },
          ],
        },
      ]);
    }
  }
});

test("OR tool loop: leg 1's reasoning_details ride back on leg 2's assistant row", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([openRouterReasoningToolStream({ text: REASONING, signature: SIGNATURE }), openAiTextStream("18C and clear.")], recorded);

  const leg1 = await runOpenAiCompatChatTurn(orRequest(), turnDeps(fetchImpl));
  expect(leg1.toolCalls?.[0]?.name).toBe("get_weather");
  expect(leg1.reasoningParts).toHaveLength(1);
  const details = leg1.reasoningParts?.[0]?.meta?.openrouter?.reasoningDetails;
  expect(Array.isArray(details)).toBe(true);
  expect(JSON.stringify(details)).toContain(SIGNATURE);

  const leg2 = orRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] },
      {
        role: "assistant",
        content: [...(leg1.reasoningParts ?? []), { type: "tool-call", toolCallId: "call_1", name: "get_weather", arguments: '{"city":"Paris"}' }],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", content: "18C, clear." }] },
    ],
  });
  await runOpenAiCompatChatTurn(leg2, turnDeps(fetchImpl));

  const second = recorded[1];
  expect(second).toBeDefined();
  const assistant = assistantRowOf(second as RecordedRequest);
  expect(JSON.stringify(assistant["reasoning_details"])).toContain(SIGNATURE);
});

test("direct Gemini tool signatures survive the SDK stream and follow-up prompt", async () => {
  const signature = "google-tool-signature";
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch(
    [
      [
        {
          event: "",
          data: {
            id: "gemini-leg1",
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: { name: "get_weather", arguments: '{"city":"Paris"}' },
                      extra_content: { google: { thought_signature: signature } },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
        },
        {
          event: "",
          data: {
            id: "gemini-leg1",
            choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          },
        },
      ],
      openAiTextStream("18C and clear."),
    ],
    recorded,
  );
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "gemini-3-flash-preview",
    capability: generationCapability(),
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    secret: fakeApiKeySecret("probe-key"),
  });
  const request = orRequest({ connection });
  const first = await runOpenAiCompatChatTurn(request, turnDeps(fetchImpl));
  const call = first.toolCalls?.[0];
  expect(call).toMatchObject({ name: "get_weather", thoughtSignature: signature });
  if (call === undefined) {
    throw new Error("missing Gemini tool call");
  }
  await runOpenAiCompatChatTurn(
    orRequest({
      connection,
      history: [
        ...request.history,
        { role: "assistant", content: [{ type: "tool-call", ...call }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId, content: "18C and clear." }] },
      ],
    }),
    turnDeps(fetchImpl),
  );
  const second = recorded[1];
  if (second === undefined) {
    throw new Error("missing Gemini follow-up");
  }
  expect(assistantRowOf(second)["tool_calls"]).toEqual([expect.objectContaining({ extra_content: { google: { thought_signature: signature } } })]);
});

test("H1(b): verbosity rides extraBody on the OR route when the capability advertises it", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([openAiTextStream("ok")], recorded);
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "openai/gpt-5.4",
    capability: generationCapability({ verbosity: ["low", "medium", "high"] }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const req = orRequest({ connection, params: { effort: "high", verbosity: "low" }, tools: undefined });
  const turn = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl));
  expect(warningCodes(turn)).not.toContain("verbosity_dropped");
  expect(recorded[0]?.body["verbosity"]).toBe("low");
});

test("E2: a hyphenated provider id keys providerOptions by its camel form (no per-call deprecation)", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([openAiTextStream("ok")], recorded);
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "some-model",
    capability: generationCapability({ sampling: { temperature: { min: 0, max: 2 }, repetitionPenalty: { min: 0, max: 2 } } }),
    baseUrl: "https://box.local/v1",
    secret: fakeApiKeySecret("sk-box-not-a-real-key"),
  });
  const req = orRequest({ connection, params: { effort: "high", repetitionPenalty: 1.1 }, tools: undefined });
  const turn = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl));
  const messages = turn.events.flatMap((event) => (event.kind === "warning" ? [event.message] : []));
  expect(messages.filter((message) => message.includes("providerOptions key"))).toHaveLength(0);
  // The unmodelled knob still reaches the body — the camel key is what the SDK spreads.
  expect(recorded[0]?.body["repetition_penalty"]).toBe(1.1);
});

// ── the record-truth pins (audit B1 · B6 · B7) ────────────────────────────────────────────────────────────

/** The OpenAI-style rate-limit family as the direct shim answered it (measured 2026-09-20, `req_f68c8dc2e4a24908a2e5be64132edbc0`). */
const RATE_HEADERS = {
  "x-ratelimit-limit-requests": "500",
  "x-ratelimit-remaining-requests": "499",
  "x-ratelimit-reset-requests": "120ms",
  "x-ratelimit-limit-tokens": "500000",
  "x-ratelimit-remaining-tokens": "499990",
  "x-ratelimit-reset-tokens": "1ms",
};

/** An openai-compatible ENDPOINT row (effort mode) whose folded features come from `declaredFeatures`. */
function endpointRequest(effort: (typeof EFFORT_SPELLINGS)[number]): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }),
    baseUrl: "https://box.local/v1",
    secret: fakeApiKeySecret("sk-box-not-a-real-key"),
    declaredFeatures: { effort },
  });
  return orRequest({ connection, params: { effort: "high" }, tools: undefined });
}

test("B1: a row that spells no reasoning_effort records appliedEffort null — the ask was high, the wire carried nothing", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(endpointRequest("none"), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  expect(turn.reply).toBe("ok");
  expect("reasoning_effort" in (recorded[0]?.body ?? {})).toBe(false);
  expect(turn.appliedEffort).toBeNull();
  expect(warningCodes(turn)).toContain("effort_dropped");
});

test("B1 (positive control): a row that spells reasoning_effort records the word the body carries", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(endpointRequest("reasoning_effort"), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  expect(recorded[0]?.body["reasoning_effort"]).toBe("high");
  expect(turn.appliedEffort).toBe("high");
});

// ── the template thinking state (body rule 5b) ───────────────────────────────────────────────────────────
// A server's own thinking default decides a turn the preset left unset. On a folded RPG turn (terminal tools
// attached) a template that thinks answers with the state calls alone, so an unset preset is spelled off there.

const REASONING_EFFORT_CAPABILITY = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });

function rowRequest(providerId: string, params: UserIntent, terminalToolsAttached: boolean): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId,
    model: "m",
    capability: REASONING_EFFORT_CAPABILITY,
    baseUrl: "http://127.0.0.1:1/v1",
    secret: fakeApiKeySecret("sk-not-a-real-key"),
  });
  return orRequest({ connection, params, ...(terminalToolsAttached ? { terminalToolsAttached: true } : {}) });
}

const kwargsOf = (body: Record<string, unknown>): unknown => body["chat_template_kwargs"];

test("a folded turn on a row with a thinking switch sends thinking off when the preset leaves reasoning unset", async () => {
  expect(kwargsOf(await sentBody(rowRequest("vllm", {}, true)))).toEqual({ enable_thinking: false, preserve_reasoning: false });
  // Outside a folded turn the unset choice still falls to the server's default: nothing rides.
  expect(kwargsOf(await sentBody(rowRequest("vllm", {}, false)))).toBeUndefined();
});

test("a folded turn with reasoning unset never tells a mandatory-reasoning model's template off", async () => {
  const mandatory = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], mandatory: true } });
  const req = rowRequest("vllm", {}, true);
  const body = await sentBody({ ...req, connection: { ...req.connection, capability: mandatory } });
  expect(kwargsOf(body)).toBeUndefined();
});

test("the preset's own reasoning choice rides on a row with a thinking switch, folded or not", async () => {
  for (const terminal of [true, false]) {
    expect(kwargsOf(await sentBody(rowRequest("llama-cpp", { effort: "high" }, terminal))), `terminal ${String(terminal)}`).toEqual({
      enable_thinking: true,
      preserve_reasoning: false,
    });
    expect(kwargsOf(await sentBody(rowRequest("llama-cpp", { effort: "none" }, terminal))), `terminal ${String(terminal)}`).toEqual({
      enable_thinking: false,
      preserve_reasoning: false,
    });
  }
});

test("a Custom connection sends the switch, and the user's own body or a declared none outranks it", async () => {
  expect(kwargsOf(await sentBody(rowRequest("custom-openai", {}, true)))).toEqual({ enable_thinking: false, preserve_reasoning: false });
  expect(kwargsOf(await sentBody(rowRequest("custom-openai", { effort: "none" }, false)))).toEqual({ enable_thinking: false, preserve_reasoning: false });
  const custom = (overrides: Omit<Parameters<typeof fakeResolved<"chat">>[0], "task">): OpenAiCompatChatRequest =>
    orRequest({ connection: fakeResolved({ ...overrides, task: "chat" }), params: {}, terminalToolsAttached: true });
  const base = {
    providerId: "custom-openai",
    model: "m",
    capability: REASONING_EFFORT_CAPABILITY,
    baseUrl: "http://127.0.0.1:1/v1",
    secret: fakeApiKeySecret("sk-not-a-real-key"),
  } as const;
  // The user's extras state thinking on: theirs rides, not the folded turn's off.
  expect(kwargsOf(await sentBody(custom({ ...base, extras: { chat_template_kwargs: { enable_thinking: true } } })))).toEqual({
    enable_thinking: true,
    preserve_reasoning: false,
  });
  // The preset's temperature reaches the SDK; the connection's own body says otherwise, and the body wins.
  const hot = await sentBody({
    ...custom({ ...base, extras: { temperature: 1.2, top_p: 0.5 } }),
    params: { temperature: 0.8, topP: 0.9 },
  });
  expect([hot["temperature"], hot["top_p"]]).toEqual([1.2, 0.5]);
  // A strict proxy: the connection excludes the key, or declares the row has no switch. Nothing rides.
  expect(kwargsOf(await sentBody(custom({ ...base, transport: { excludeBody: ["chat_template_kwargs"] } })))).toBeUndefined();
  expect(kwargsOf(await sentBody(custom({ ...base, declaredFeatures: { thinkingOff: "none" } })))).toBeUndefined();
});

test("hosted rows without a thinking switch are byte-identical whether or not the turn folds", async () => {
  for (const providerId of ["openrouter", "openai"]) {
    for (const params of [{}, { effort: "high" }, { effort: "none" }] satisfies UserIntent[]) {
      const folded = await sentBody(rowRequest(providerId, params, true));
      expect(kwargsOf(folded), providerId).toBeUndefined();
      expect(folded, `${providerId} ${JSON.stringify(params)}`).toEqual(await sentBody(rowRequest(providerId, params, false)));
    }
  }
});

// Off is a choice the wire has to carry: a reasoning model left without `reasoning_effort` reasons at its own
// default, which spends the tokens and latency the user turned off.
function offRequest(
  reasoning: Parameters<typeof generationCapability>[0],
  params: OpenAiCompatChatRequest["params"] = { effort: "none" },
  thinkingOff?: "none" | undefined,
): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability(reasoning),
    baseUrl: "https://box.local/v1",
    secret: fakeApiKeySecret("sk-box-not-a-real-key"),
    declaredFeatures: { effort: "reasoning_effort", ...(thinkingOff === undefined ? {} : { thinkingOff }) },
  });
  return orRequest({ connection, params, tools: undefined });
}

// The preset's parallel-tool switch turned OFF (`false`) must reach a tools request on both dialects; unset sends
// nothing, so the endpoint's own default stands.
test("parallelToolCalls false sends parallel_tool_calls false on both dialects; unset sends no field", async () => {
  const direct = offRequest({ reasoning: { mode: "none", enabled: false } }, { advanced: { parallelToolCalls: false } });
  const tools = orRequest().tools;
  expect((await sentBody({ ...direct, tools }))["parallel_tool_calls"]).toBe(false);
  expect((await sentBody(orRequest({ params: { advanced: { parallelToolCalls: false } } })))["parallel_tool_calls"]).toBe(false);
  expect(await sentBody({ ...offRequest({ reasoning: { mode: "none", enabled: false } }, {}), tools })).not.toHaveProperty("parallel_tool_calls");
  expect(await sentBody(orRequest({ params: {} }))).not.toHaveProperty("parallel_tool_calls");
});

// A stored `true` is the endpoint's own default, and some OpenAI-compatible layers refuse the field outright
// (Gemini: `Unknown name "parallel_tool_calls"`), so it never goes out on either dialect.
test("parallelToolCalls true sends no parallel_tool_calls field on either dialect", async () => {
  const direct = offRequest({ reasoning: { mode: "none", enabled: false } }, { advanced: { parallelToolCalls: true } });
  expect(await sentBody({ ...direct, tools: orRequest().tools })).not.toHaveProperty("parallel_tool_calls");
  expect(await sentBody(orRequest({ params: { advanced: { parallelToolCalls: true } } }))).not.toHaveProperty("parallel_tool_calls");
});

test("off sends reasoning_effort none where the model can turn reasoning off, and records none as applied", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(
    offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }, { effort: "none" }, "none"),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  );
  expect(recorded[0]?.body["reasoning_effort"]).toBe("none");
  expect(turn.appliedEffort).toBe("none");
});

// Where the row's thinking switch is the template kwarg, the kwarg is the off: `none` beside it would contradict it.
test("off on a row whose switch is the template kwarg sends enable_thinking false alone, and records none as applied", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(
    offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  );
  expect(recorded[0]?.body["chat_template_kwargs"]).toMatchObject({ enable_thinking: false });
  expect(recorded[0]?.body).not.toHaveProperty("reasoning_effort");
  expect(turn.appliedEffort).toBe("none");
});

// An unset effort is the model's own default, never a hidden off: the field is omitted, on an optional and on a
// mandatory model alike.
test("an unset effort omits reasoning_effort, so the model reasons at its own default", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(
    offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }, {}),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  );
  expect("reasoning_effort" in (recorded[0]?.body ?? {})).toBe(false);
  expect(turn.appliedEffort).toBeNull();
  const mandatory = await sentBody(offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], mandatory: true } }, {}));
  expect("reasoning_effort" in mandatory).toBe(false);
});

test("off on a model that cannot turn reasoning off clamps to its lowest level, and a non-reasoning model sends no field", async () => {
  const mandatory = await sentBody(offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], mandatory: true } }));
  expect(mandatory["reasoning_effort"]).toBe("low");
  const plain = await sentBody(offRequest({ reasoning: { mode: "none", enabled: false } }));
  expect("reasoning_effort" in plain).toBe(false);
});

test("B6 + B7: the response headers become the rate-limit snapshot and the endpoint's response id is the generationId", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(endpointRequest("reasoning_effort"), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded, RATE_HEADERS)));
  expect(turn.rateLimit).toMatchObject({ status: "allowed", rateLimitType: "requests", resetsAt: NOW + 120 });
  expect(turn.rateLimit?.utilization).toBeCloseTo(0.002);
  expect(turn.generationId).toBe("gen-leg2");
  expect(turn.usage).toMatchObject({ tokensIn: 10, tokensOut: 5, costProvenance: "unrecorded", costDetails: null });
  // Below the canary threshold no rate_limit event rides.
  expect(turn.events.some((event) => event.kind === "rate_limit")).toBe(false);
  // PLANTED CONTROL: a response without the family leaves the snapshot null.
  const bare = await runOpenAiCompatChatTurn(endpointRequest("reasoning_effort"), turnDeps(scriptedSseFetch([openAiTextStream("ok")], [])));
  expect(bare.rateLimit).toBeNull();
});

// ── C3: the OpenRouter plugin list is a MERGE, not a hard-coded single entry ─────────────────────────────
// The transport owns context-compression (off the preset's `providerContextCompression`); the user owns
// everything else OR models. Before this the whole `plugins` array was one hard-coded entry, so
// `response-healing` — the server-side answer to the malformed JSON our non-streaming structured task has to
// re-ask for — was unreachable no matter what the connection declared.

/** A connection whose `extras` the belt has to judge — minted through the real factory's own `extras`
 *  axis, so a change to the resolved shape breaks HERE rather than being hidden by a cast. */
const extrasConnection = (extras: Readonly<Record<string, JsonValue>>): OpenAiCompatChatRequest["connection"] =>
  fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
    extras,
  });

async function sentBody(req: OpenAiCompatChatRequest): Promise<Record<string, unknown>> {
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  return recorded[0]?.body ?? {};
}

test("C3: a user's declared plugins merge AFTER the turn-owned compression entry", async () => {
  const body = await sentBody(
    orRequest({
      tools: undefined,
      connection: extrasConnection({ plugins: [{ id: "response-healing" }, { id: "web", max_results: 3 }] }),
    }),
  );

  // Order IS the precedence: compression leads because it is the one entry this layer decides.
  expect(body["plugins"]).toMatchObject([{ id: "context-compression" }, { id: "response-healing" }, { id: "web", max_results: 3 }]);
});

test("C3: a user entry re-declaring `context-compression` is dropped loudly — MODELLED WINS", async () => {
  const events: string[] = [];
  const recorded: RecordedRequest[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ plugins: [{ id: "context-compression", enabled: true }, { id: "moderation" }] }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        events.push(event.code);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));

  expect(recorded[0]?.body["plugins"]).toMatchObject([{ id: "context-compression", enabled: false }, { id: "moderation" }]);
  expect(events).toContain("custom_parameters_ignored");
});

test("C3: a MALFORMED plugin block is dropped whole, loudly — never sent half-valid", async () => {
  const events: string[] = [];
  const recorded: RecordedRequest[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ plugins: [{ id: "not-a-real-plugin" }] }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        events.push(event.code);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));

  expect(recorded[0]?.body["plugins"]).toMatchObject([{ id: "context-compression" }]);
  expect(events).toContain("custom_parameters_ignored");
});

// ── D3: OpenRouter's request DEBUG block ────────────────────────────────────────────────────────────────
// `debug.echo_upstream_body` is the only way to see what a ROUTED provider actually received — OR answers
// with the upstream body as the FIRST SSE frame. It was unreachable: the transport models two extras keys
// and drops the rest, so a user could declare it and it would never be sent. The SDK's `includeRawChunks` is
// NOT the door (it only re-surfaces already-parsed chunks as `raw` PARTS); the capture's own reply tap is
// (`backends/v4/fetch.ts` control 4b, which records why the raw part was refused).

test("D3: `extras.debug` rides the OR body, and nothing is sent when it is not declared", async () => {
  const withDebug = await sentBody(orRequest({ tools: undefined, connection: extrasConnection({ debug: { echo_upstream_body: true } }) }));
  expect(withDebug["debug"]).toMatchObject({ echo_upstream_body: true });

  const without = await sentBody(orRequest({ tools: undefined, connection: extrasConnection({}) }));
  expect(without["debug"]).toBeUndefined();
});

test("D3: a MALFORMED debug block is dropped whole, loudly — never sent half-valid", async () => {
  const messages: string[] = [];
  const recorded: RecordedRequest[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ debug: { echo_upstream_body: "yes please" } }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        messages.push(event.message);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));

  expect(recorded[0]?.body["debug"]).toBeUndefined();
  // The READER'S refusal, not the belt's generic drop: an `extras` key the transport takes must never be
  // reported as "ignored: the openrouter transport takes only …" — see `body.ts`'s modelled-key list.
  expect(messages).toContain("extras.debug ignored: not a valid openrouter debug block");
});

// OpenRouter answers `provider.require_parameters` beside `response_format` with 404 "no endpoints", so the layer
// never adds it; the user's own `provider` block is theirs and rides as set.
test("a structured OpenRouter turn never adds provider.require_parameters; the user's own provider block rides as set", async () => {
  const responseFormat = { name: "row", schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }) };
  const ours = await sentBody(orRequest({ tools: undefined, responseFormat, connection: extrasConnection({}) }));
  expect(ours["response_format"]).toBeDefined();
  expect((ours["provider"] as Record<string, unknown> | undefined)?.["require_parameters"]).toBeUndefined();
  const theirs = await sentBody(orRequest({ tools: undefined, responseFormat, connection: extrasConnection({ provider: { require_parameters: true } }) }));
  expect(theirs["provider"]).toMatchObject({ require_parameters: true });
});

test("a modelled extras door does not ALSO report itself ignored (the belt's list and the readers agree)", async () => {
  const messages: string[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ debug: { echo_upstream_body: true }, plugins: [{ id: "moderation" }], web_search_options: { max_results: 2 } }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        messages.push(event.message);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], [])));

  expect(messages.filter((message) => message.includes("the openrouter transport takes only"))).toEqual([]);
});

// ── E1/§15c: the wire-capture BYTE-EQUALITY pin, one per DIALECT — a caret bump of `@ai-sdk/openai-
// compatible` or `@openrouter/ai-sdk-provider` that reshapes ANY field of the converted request fails
// here, where every other pin in this file only checks the fields it names.

test("byte-equality (openai-compatible dialect): the FULL request body for a minimal deterministic turn", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "qwen3",
    capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }),
    baseUrl: "https://box.local/v1",
    secret: fakeApiKeySecret("sk-box-probe-not-a-real-key"),
    declaredFeatures: { effort: "reasoning_effort" },
  });
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined }), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  expect(recorded[0]?.body).toEqual({
    model: "qwen3",
    reasoning_effort: "high",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is the weather in Paris?" },
    ],
    stream: true,
    stream_options: { include_usage: true },
    // The preset's effort turns the template's thinking on, spelled where the row has a switch (Custom does), and the
    // reasoning carry left off tells the template not to replay prior thinking (body rule 5c).
    chat_template_kwargs: { enable_thinking: true, preserve_reasoning: false },
  });
});

test("byte-equality (openrouter dialect): the FULL request body for a minimal deterministic turn", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-probe-not-a-real-key"),
  });
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined }), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  expect(recorded[0]?.body).toEqual({
    model: "anthropic/claude-opus-4-5",
    messages: [
      { role: "system", content: [{ type: "text", text: "You are a helpful assistant.", cache_control: { type: "ephemeral", ttl: "1h" } }] },
      { role: "user", content: "What is the weather in Paris?" },
    ],
    reasoning: { effort: "high" },
    usage: { include: true },
    stream: true,
    stream_options: { include_usage: true },
    provider: { order: ["Anthropic"], allow_fallbacks: false },
    plugins: [{ id: "context-compression", enabled: false }],
  });
});

// OpenRouter forwards `cache_control` to Anthropic only from a CONTENT PART. A marker at message level on
// string content is dropped upstream, so the history is never cached (measured: gen-1790134941-TdEvy3D9exFNfO6cf830
// sent breakpoints on two assistant rows and read only the system block; the content-part A/B read the history,
// gen-1790135929 vs gen-1790135933). The provider converter spells an assistant row as a string with a
// message-level marker, and history breakpoints at depth d and d+2 land on assistant rows in an ordinary chat.
test("OR Anthropic history breakpoints ride the content part, never the message", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5",
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 1,
      },
    }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const text = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
  const body = await sentBody(
    orRequest({
      connection,
      tools: undefined,
      cacheBreakpointDepth: 1,
      history: [
        { role: "assistant", content: text("Greeting.") },
        { role: "user", content: text("u1") },
        { role: "assistant", content: text("a1") },
        { role: "user", content: text("u2") },
        { role: "assistant", content: text("a2") },
        { role: "user", content: text("u3") },
      ],
    }),
  );
  const messages = body["messages"] as Record<string, unknown>[];
  for (const message of messages) {
    expect(message, `${String(message["role"])} row carries a message-level marker`).not.toHaveProperty("cache_control");
  }
  const marked = messages.flatMap((message, index) =>
    Array.isArray(message["content"]) && (message["content"] as Record<string, unknown>[]).some((part) => part["cache_control"] !== undefined) ? [index] : [],
  );
  // system (0) plus depth 1 (a2, index 5) and depth 3 (a1, index 3).
  expect(marked).toEqual([0, 3, 5]);
  expect(messages[5]).toEqual({ role: "assistant", content: [{ type: "text", text: "a2", cache_control: { type: "ephemeral", ttl: "1h" } }] });
});

test("C3: `web_search_options` rides when declared, and the body carries nothing when it is not", async () => {
  const withOptions = await sentBody(orRequest({ tools: undefined, connection: extrasConnection({ web_search_options: { max_results: 5, engine: "exa" } }) }));
  expect(withOptions["web_search_options"]).toMatchObject({ max_results: 5, engine: "exa" });

  const without = await sentBody(orRequest({ tools: undefined }));
  expect(without["web_search_options"]).toBeUndefined();
});

// THE MANDATORY-REASONING STRIP-AND-REPLAY-ONCE (`drainWithReplay`) — previously UNTESTED anywhere
// (`rg isMandatoryReasoningRejection` hit only the source), and now load-bearing twice over.
//
// It is the recovery for an endpoint that rejects `reasoning.effort:"none"` with a 400: the runner peels the
// upstream body off the RAW thrown error, recognises the refusal, and replays the turn ONCE with the
// reasoning block omitted. That peel is also the reason `backends/kit/retry.ts` re-throws the ORIGINAL error
// rather than its classification — `providerErrorFromHttp` replaces `cause` with a scrubbed `new Error(safe)`
// on any credential-bearing scrub set, which would destroy exactly the body this reads.
//
// WHICH IS WHY THIS PIN EXISTS NOW. The 2026-09-20 conformance work added a typed-failure boundary to this
// runner so a streaming failure leaves the package as a `ProviderError` instead of a raw SDK object. Its
// whole safety argument is that the classify sits OUTSIDE `drainWithReplay`, so the replay still sees the
// raw error. Nothing proved that. This does: if the classify is ever moved inside — or `retry.ts` is
// "simplified" to throw `mapped` — the peel stops matching, the replay never fires, and this reds with a
// 400 instead of a reply.
test("the openrouter mandatory-reasoning 400 is peeled, stripped and replayed once — and the classify boundary does not break it", async () => {
  const recorded: RecordedRequest[] = [];
  const rejection = JSON.stringify({ error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400 } });
  const success = openAiTextStream("replayed.");
  let call = 0;
  const fetchImpl: typeof fetch = (input, init) => {
    call += 1;
    const raw = typeof init?.body === "string" ? init.body : "{}";
    recorded.push({ url: String(input), body: JSON.parse(raw) as Record<string, unknown> });
    if (call === 1) {
      return Promise.resolve(new Response(rejection, { status: 400, headers: { "content-type": "application/json" } }));
    }
    const body = success.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join("");
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  };

  // A chosen `effort: "none"` is what makes the turn REPLAYABLE: `drainWithReplay`'s second argument is
  // `dialect === "openrouter" && knobs.reasoning.offChosen === true`, the only case that sends the off block.
  const req = orRequest({ params: { effort: "none" }, tools: undefined });
  const turn = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl));

  expect(recorded, "the turn was sent twice: the rejected attempt and the stripped replay").toHaveLength(2);
  const first = recorded[0]?.body ?? {};
  const second = recorded[1]?.body ?? {};
  expect(JSON.stringify(first), "attempt 1 carried the reasoning block the endpoint refuses").toContain('"reasoning"');
  expect(JSON.stringify(second), "the replay omitted it entirely — stripped, not re-spelled").not.toContain('"reasoning"');
  expect(turn.reply, "the replay produced the turn").toBe("replayed.");
});

test("a 400 that is NOT a mandatory-reasoning refusal is NOT replayed, and reaches the caller as a typed ProviderError", async () => {
  // The negative control for the arm above — without it, a `drainWithReplay` that replayed EVERY failure
  // would pass it — and simultaneously the proof for the typed-failure boundary: the raw `APICallError` the
  // SDK threw must arrive as `ProviderError`, which is what `contract/errors.ts` promises every consumer.
  const recorded: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const raw = typeof init?.body === "string" ? init.body : "{}";
    recorded.push({ url: String(input), body: JSON.parse(raw) as Record<string, unknown> });
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: "model not found on this route", code: 400 } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  const req = orRequest({ params: { effort: "none" }, tools: undefined });
  const failure = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl)).then(
    () => null,
    (err: unknown) => err,
  );
  expect(failure, "an unrelated 400 must surface as the contract's ONE error class, never a raw SDK object").toBeInstanceOf(ProviderError);
  expect(failure instanceof ProviderError ? failure.kind : null, "a 400 is a structurally-invalid request").toBe("invalid");
  expect(recorded, "an unrelated failure is not replayed").toHaveLength(1);
});

// ── the Anthropic route follows the id the model FACTS come from ─────────────────────────────────────────
// A floating `~anthropic/…-latest` alias folds Claude's capability through its catalog target, so the wire's
// Anthropic decisions (the pinned provider routing, the system split and cache placement) must read the same
// id — never the raw alias spelling.

async function runtimeTurnBody(model: string): Promise<Record<string, unknown>> {
  const recorded: RecordedRequest[] = [];
  const catalog = openRouterCatalogFetch();
  const chat = scriptedSseFetch([openAiTextStream("ok")], recorded);
  const fetchImpl: typeof fetch = (input, init) => (String(input).includes("/chat/completions") ? chat(input, init) : catalog(input, init));
  const stores = memoryStores();
  const ownerId = newUserId();
  const credentialId = mintTypeId(ID_PREFIX.userCredential);
  const row = fakeConnection({ ownerId, providerId: "openrouter", model, allowBackground: true, credentialId });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const secrets = new Map([[credentialId, fakeApiKeySecret("sk-or-not-a-real-key")]]);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: fetchImpl, secrets }));
  const { resolved } = await runtime.resolve({ task: "chat", principal: principal(ownerId) });
  await runtime.executor.runChatTurn({
    api: "chat-completions",
    connection: { ...resolved, task: "chat" },
    params: {},
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Hi." }] }],
  });
  return recorded[0]?.body ?? {};
}

test("a `~anthropic/…-latest` alias rides the Anthropic route: pinned routing and a cached system block", async () => {
  const body = await runtimeTurnBody("~anthropic/claude-fable-latest");
  expect(body["provider"]).toEqual({ order: ["Anthropic"], allow_fallbacks: false });
  expect(body["messages"]).toMatchObject([{ role: "system", content: [{ type: "text", cache_control: { type: "ephemeral", ttl: "1h" } }] }, { role: "user" }]);
  // PLANTED CONTROL: an alias whose catalog row names no target is not treated as Claude by its spelling.
  expect((await runtimeTurnBody("~anthropic/claude-mystery-latest"))["provider"]).toBeUndefined();
});

// ── forced tool choice on the openai-compat wire ─────────────────────────────────────────────────────────
// OpenRouter forwards `tool_choice` upstream verbatim, so a model that rejects forced tool use 400s here as it
// does on the direct wire. The downgrade reads the capability: a row that states no refusal keeps `required`.

/** An OpenRouter connection whose capability is the REAL curated fold for `model` on this route. */
function orCuratedConnection(model: string): OpenAiCompatChatRequest["connection"] {
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("openrouter"), wire: "openai-compat", api: "chat-completions" }),
  });
  return fakeResolved({ task: "chat", providerId: "openrouter", model, capability, secret: fakeApiKeySecret("sk-or-not-a-real-key") });
}

const FORCED = [{ mode: "required" }, { mode: "tool", name: "get_weather" }] as const;

test("#2575: OpenRouter + a model that rejects forced tool use sends `auto`, warned once", async () => {
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-opus-5.5"]) {
    for (const toolChoice of FORCED) {
      const recorded: RecordedRequest[] = [];
      const turn = await runOpenAiCompatChatTurn(
        orRequest({ connection: orCuratedConnection(model), toolChoice }),
        turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
      );
      expect(recorded[0]?.body["tool_choice"], `${model} · ${toolChoice.mode}`).toBe("auto");
      expect(recorded[0]?.body["tools"], model).toMatchObject([{ function: { name: "get_weather" } }]);
      expect(
        warningCodes(turn).filter((code) => code === "tool_choice_downgraded"),
        model,
      ).toHaveLength(1);
    }
  }
});

test("#2575 (controls): Opus 5 on OpenRouter and a vLLM-shaped endpoint keep the forced choice byte-for-byte", async () => {
  const vllm = fakeResolved({
    task: "chat",
    providerId: "vllm",
    model: "Qwen/Qwen3-8B",
    capability: generationCapability({ tools: { parallel: true, silencesProse: true } }),
    baseUrl: "http://127.0.0.1:8000/v1",
  });
  for (const connection of [orCuratedConnection("anthropic/claude-opus-5"), vllm]) {
    const recorded: RecordedRequest[] = [];
    const turn = await runOpenAiCompatChatTurn(
      orRequest({ connection, toolChoice: { mode: "required" } }),
      turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
    );
    expect(recorded[0]?.body["tool_choice"], connection.model).toBe("required");
    expect(warningCodes(turn), connection.model).not.toContain("tool_choice_downgraded");
    const named: RecordedRequest[] = [];
    await runOpenAiCompatChatTurn(orRequest({ connection, toolChoice: FORCED[1] }), turnDeps(scriptedSseFetch([openAiTextStream("ok")], named)));
    expect(named[0]?.body["tool_choice"], connection.model).toMatchObject({ type: "function", function: { name: "get_weather" } });
  }
});

// ── the default effort on the OpenRouter wire ────────────────────────────────────────────────────────────
// A bare `reasoning.effort` turns Claude reasoning on: OpenRouter sends adaptive thinking upstream with the word as
// `output_config.effort` (echo gen-1790141847-svcaPqDtmlhF34sxweVp: `{effort: "high"}` alone → thinking adaptive,
// output_config.effort high). A `reasoning.max_tokens` would switch a 4.6 model to budget thinking, and a body
// `verbosity` also writes `output_config.effort` and wins over the reasoning effort. So a turn with nothing set
// must carry exactly `{effort: "high"}`, never `max_tokens`, never `verbosity`.
test("OR Claude with no effort set sends reasoning {effort: high} — no max_tokens, no verbosity", async () => {
  for (const params of [{}, { verbosity: "low" }, { thinkingBudgetTokens: 4000 }] satisfies UserIntent[]) {
    for (const model of ["anthropic/claude-opus-5", "anthropic/claude-fable-5.1", "anthropic/claude-opus-4.8"]) {
      const body = await sentBody(orRequest({ connection: orCuratedConnection(model), tools: undefined, params }));
      expect(body["reasoning"], `${model} ${JSON.stringify(params)}`).toEqual({ effort: "high" });
      expect(body, `${model} ${JSON.stringify(params)}`).not.toHaveProperty("verbosity");
    }
  }
});

test("OR non-adaptive reasoning keeps its bytes: an effort-mode model sends the bare effort word", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "google/gemini-3.5-flash",
    capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], defaultEffort: "medium" } }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const body = await sentBody(orRequest({ connection, tools: undefined, params: {} }));
  expect(body["reasoning"]).toEqual({ effort: "medium" });
});

test("OR: an unset effort with no advertised default sends no reasoning block, and a chosen off sends effort none", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "google/gemini-3.5-flash",
    capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  expect("reasoning" in (await sentBody(orRequest({ connection, tools: undefined, params: {} })))).toBe(false);
  expect((await sentBody(orRequest({ connection, tools: undefined, params: { effort: "none" } })))["reasoning"]).toEqual({ effort: "none" });
});

// OpenRouter's own `reasoning.effort` takes `max` and forwards it upstream verbatim (audit echo: effort "max" →
// output_config.effort "max"); only the V4 vocabulary lacks the word. The funnel has already refused a level
// the model does not list, so the openrouter spelling passes the resolved word through.
// `max` was measured upstream only on the adaptive Claude ids. An OpenAI or Gemini row whose catalog lists every
// level (or none, which folds to every level) keeps the V4 mapping it always had: `max` goes out as `xhigh`.
test("OR non-adaptive reasoning keeps `max` → `xhigh`, byte for byte", async () => {
  for (const [model, reasoning] of [
    ["openai/gpt-5.4", { mode: "effort", enabled: true, effortLevels: ["minimal", "low", "medium", "high", "xhigh", "max"] }],
    ["openai/gpt-5.6-sol", { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] }],
    ["google/gemini-3.5-flash", { mode: "effort", enabled: true, effortLevels: ["minimal", "low", "medium", "high", "xhigh", "max"] }],
  ] as const) {
    const connection = fakeResolved({
      task: "chat",
      providerId: "openrouter",
      model,
      capability: generationCapability({ reasoning: { ...reasoning, effortLevels: [...reasoning.effortLevels] } }),
      secret: fakeApiKeySecret("sk-or-not-a-real-key"),
    });
    const body = await sentBody(orRequest({ connection, tools: undefined, params: { effort: "max" } }));
    expect(body["reasoning"], model).toEqual({ effort: "xhigh" });
  }
});

test("OR Claude effort `max` reaches the wire as `max`, not `xhigh`", async () => {
  const body = await sentBody(orRequest({ connection: orCuratedConnection("anthropic/claude-opus-5"), tools: undefined, params: { effort: "max" } }));
  expect(body["reasoning"]).toEqual({ effort: "max" });
});

/** The prompt as the cache reads it: a boundary entry per message, then one entry per part (a string body is its
 *  one text part), with the `cache_control` marker set aside (it is not prompt bytes) and reported as the entry
 *  index it rode on. */
function cachedParts(messages: readonly Record<string, unknown>[]): { readonly entries: readonly string[]; readonly marked: readonly number[] } {
  const entries: string[] = [];
  const marked: number[] = [];
  for (const message of messages) {
    entries.push(`message:${String(message["role"])}`);
    const content = message["content"];
    const parts: Record<string, unknown>[] = typeof content === "string" ? [{ type: "text", text: content }] : [];
    if (Array.isArray(content)) {
      parts.push(...(content as Record<string, unknown>[]));
    }
    for (const { cache_control: marker, ...part } of parts) {
      if (marker !== undefined) {
        marked.push(entries.length);
      }
      entries.push(JSON.stringify(part));
    }
  }
  return { entries, marked };
}

// SHAPE keeps each stored row of a same-role run its own row when the turn caches by explicit Anthropic markers.
// Rule 10 folds them into one message with one part per row, so the wire alternates and the part the previous
// call marked keeps its bytes and its end when the next speaker's reply lands under it. The gate is the resolved
// capability (`explicitPromptCache`) plus the model family, never the route, and nothing about prefill or the
// trailing cue changes.
const orText = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
const ROUND_OPENING = [
  { role: "user", content: orText("We head for the harbor.") },
  { role: "assistant", content: orText("Mira: Mira leads.") },
  { role: "assistant", content: orText("Wren: Wren scouts.") },
] satisfies OpenAiCompatChatRequest["history"];
const KAI_CUE = { role: "user", content: orText("[Write the next reply only as Kai.]") } satisfies OpenAiCompatChatRequest["history"][number];
const CC_1H = { type: "ephemeral", ttl: "1h" };

function roundCall(model: string, assistantPrefill: boolean): (history: OpenAiCompatChatRequest["history"]) => Promise<Record<string, unknown>[]> {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model,
    // The same cell on every case, explicit caching included, so only the model family decides the fold.
    capability: generationCapability({
      turns: {
        assistantPrefill,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 1,
      },
    }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  return async (history) =>
    (await sentBody(orRequest({ connection, tools: undefined, cacheBreakpointDepth: 1, history })))["messages"] as Record<string, unknown>[];
}

for (const { model, assistantPrefill } of [
  { model: "anthropic/claude-sonnet-5", assistantPrefill: false },
  { model: "anthropic/claude-opus-4.5", assistantPrefill: true },
]) {
  test(`OR ${model} (prefill ${String(assistantPrefill)}): a three-speaker round is one message of three parts, and the marked prefix repeats`, async () => {
    const call = roundCall(model, assistantPrefill);
    // Kai's call ends on the cue; the next send adds Kai's reply under the block Kai's call marked.
    const kaiTurn = await call([...ROUND_OPENING, KAI_CUE]);
    const nextSend = await call([
      ...ROUND_OPENING,
      { role: "assistant", content: orText("Kai: Kai follows.") },
      { role: "user", content: orText("Board the ship.") },
    ]);

    expect(kaiTurn[2]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Mira: Mira leads." },
        { type: "text", text: "Wren: Wren scouts.", cache_control: CC_1H },
      ],
    });
    expect(nextSend.map((message) => message["role"])).toEqual(["system", "user", "assistant", "user"]);
    expect(nextSend[2]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Mira: Mira leads." },
        { type: "text", text: "Wren: Wren scouts." },
        { type: "text", text: "Kai: Kai follows.", cache_control: CC_1H },
      ],
    });
    const n = cachedParts(kaiTurn);
    const next = cachedParts(nextSend);
    const through = Math.max(...n.marked) + 1;
    expect(next.entries.slice(0, through)).toEqual(n.entries.slice(0, through));
  });
}

test("OR prefill-capable Anthropic model: a run that ends the history folds and keeps its assistant tail", async () => {
  const messages = await roundCall("anthropic/claude-opus-4.5", true)(ROUND_OPENING);
  expect(messages.map((message) => message["role"])).toEqual(["system", "user", "assistant"]);
  expect((messages[2]?.["content"] as unknown[]).length).toBe(2);
});

test("OR non-Anthropic model: the round's rows pass through 1:1 with no history marker, as before", async () => {
  const messages = await roundCall("google/gemini-3-pro", false)([...ROUND_OPENING, KAI_CUE]);
  expect(messages).toEqual([
    { role: "system", content: [{ type: "text", text: "You are a helpful assistant." }] },
    { role: "user", content: "We head for the harbor." },
    { role: "assistant", content: "Mira: Mira leads." },
    { role: "assistant", content: "Wren: Wren scouts." },
    { role: "user", content: "[Write the next reply only as Kai.]" },
  ]);
});

// ── the connection's PROMPT-CACHE settings on the OpenRouter → Anthropic route ────────────────────────────
// The same four settings as the direct wire, pinned on the bytes OpenRouter receives: markers ride content
// PARTS (the only place OpenRouter forwards them), the system is `messages[0]`, and there is no tool marker on
// this route. The Anthropic provider pin is a routing fact, not a cache setting: it stays whatever caching says.

/** Every content-part marker in message order: `[messageIndex, marker]`. */
function orMarkers(body: Record<string, unknown>): readonly (readonly [number, unknown])[] {
  const messages = Array.isArray(body["messages"]) ? (body["messages"] as Record<string, unknown>[]) : [];
  return messages.flatMap((message, index) =>
    (Array.isArray(message["content"]) ? (message["content"] as Record<string, unknown>[]) : []).flatMap((part) =>
      part["cache_control"] === undefined ? [] : [[index, part["cache_control"]] as const],
    ),
  );
}

function orCacheTurn(promptCache: PromptCacheSettings, cacheBreakpointDepth = 1): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5",
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 1,
        requestAutomaticPromptCache: true,
      },
    }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
    promptCache,
  });
  return orRequest({
    connection,
    tools: undefined,
    cacheBreakpointDepth,
    history: [
      { role: "user", content: orText("u0") },
      { role: "assistant", content: orText("a0") },
      { role: "user", content: orText("u1") },
      { role: "assistant", content: orText("a1") },
      { role: "user", content: orText("u2") },
      { role: "assistant", content: orText("a2") },
      { role: "user", content: orText("u3") },
    ],
  });
}

test("OpenRouter Anthropic automatic caching carries one root directive and preserves manual routing law", async () => {
  const body = await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, requestAutomatic: true, ttl: "1h" }));
  expect(body["cache_control"]).toEqual({ type: "ephemeral", ttl: "1h" });
  expect(orMarkers(body)).toEqual([]);
  expect(body["provider"]).toEqual({ order: ["Anthropic"], allow_fallbacks: false });
});

for (const ttl of ["5m", "1h"] as const) {
  test(`OR prompt cache ttl ${ttl}: the system part and the history pair all carry it`, async () => {
    const markers = orMarkers(await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, ttl })));
    // system (0), then depth 3 (a1, index 4) and depth 1 (a2, index 6) — one ttl, so the order rule holds.
    expect(markers.map(([index]) => index)).toEqual([0, 4, 6]);
    for (const [, marker] of markers) {
      expect(marker).toEqual({ type: "ephemeral", ttl });
    }
  });
}

test("OR prompt cache: with the system block off, only the history pair is marked", async () => {
  const body = await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, cacheSystem: false }));
  expect(orMarkers(body).map(([index]) => index)).toEqual([4, 6]);
});

test("OR prompt cache OFF: no cache_control in the body, and the Anthropic provider pin is unchanged", async () => {
  const req = orCacheTurn({ ...SHIPPED_PROMPT_CACHE, enabled: false });
  const history = req.history.map((row, index) => (index === 1 ? { ...row, wireMeta: { cacheBreakpoint: true as const } } : row));
  const body = await sentBody({ ...req, history });
  expect(JSON.stringify(body)).not.toContain("cache_control");
  expect(body["provider"]).toEqual({ order: ["Anthropic"], allow_fallbacks: false });
});

test("OR prompt cache depth: the connection's minimum moves the pair deeper, and never shallower than the request's depth", async () => {
  // Request depth 1, user minimum 3 ⇒ depths 3 and 5: a1 (index 4) and a0 (index 2).
  expect(orMarkers(await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 3 }, 1))).map(([index]) => index)).toEqual([0, 2, 4]);
  // Request depth 3 (admin-floored upstream), user minimum 1 ⇒ the request's depth stands.
  expect(orMarkers(await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 1 }, 3))).map(([index]) => index)).toEqual([0, 2, 4]);
});

function geminiCacheTurn(overrides: Partial<PromptCacheSettings> = {}, dynamic = ""): OpenAiCompatChatRequest {
  const model = "google/gemini-2.5-flash";
  const capability = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model, providerId: testProviderId("openrouter"), wire: "openai-compat" }),
  }).capability;
  return orRequest({
    connection: fakeResolved({
      task: "chat",
      providerId: "openrouter",
      model,
      capability,
      secret: fakeApiKeySecret("fake-or-key"),
      promptCache: { ...SHIPPED_PROMPT_CACHE, ...overrides },
    }),
    params: { effort: "none" },
    tools: undefined,
    systemPrompt: { static: "Stable knowledge. ".repeat(1800), dynamic },
    history: orCacheTurn(SHIPPED_PROMPT_CACHE).history,
    cacheBreakpointDepth: 1,
  });
}

test("Gemini OR explicit cache uses its fixed TTL on stable system and history without an Anthropic routing pin", async () => {
  const body = await sentBody(geminiCacheTurn());
  expect(orMarkers(body)).toEqual([
    [0, { type: "ephemeral", ttl: "5m" }],
    [4, { type: "ephemeral", ttl: "5m" }],
    [6, { type: "ephemeral", ttl: "5m" }],
  ]);
  expect(body).not.toHaveProperty("provider");
});

test("Gemini OR preserves the dynamic system position and marks only history; off and insufficient prefixes never mark", async () => {
  const req = geminiCacheTurn({}, "Changing turn context.");
  const body = await sentBody(req);
  expect(orMarkers(body).map(([index]) => index)).toEqual([4, 6]);
  expect(body["messages"]).toEqual(
    expect.arrayContaining([
      { role: "system", content: [{ type: "text", text: req.systemPrompt.static.trim() + "\n\nChanging turn context." }] },
      { role: "user", content: "u0" },
    ]),
  );
  expect(orMarkers(await sentBody(geminiCacheTurn({ enabled: false })))).toEqual([]);
  expect(orMarkers(await sentBody({ ...geminiCacheTurn(), systemPrompt: { static: "small", dynamic: "" } }))).toEqual([]);
  expect(orMarkers(await sentBody(geminiCacheTurn({ cacheSystem: false, historyDepth: 3 }))).map(([index]) => index)).toEqual([2, 4]);
});

test("measured OR Gemini 3.1 Pro prefill remains a final assistant prefix through the SDK", async () => {
  const req = geminiCacheTurn({ enabled: false });
  const model = "google/gemini-3.1-pro-preview";
  const capability = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model, providerId: testProviderId("openrouter"), wire: "openai-compat" }),
  }).capability;
  const body = await sentBody({
    ...req,
    connection: { ...req.connection, model: testModelId(model), capability },
    systemPrompt: { static: "Keep order.", dynamic: "" },
    history: [
      { role: "user", content: orText("Respond: The answer is ORBIT.") },
      { role: "assistant", content: orText("The answer is") },
    ],
  });
  expect(body["messages"]).toMatchObject([{ role: "system" }, { role: "user" }, { role: "assistant", content: "The answer is" }]);
});

// ── llama.cpp without --jinja: the server reports template tool support and refuses tools[] ─────────────
// `/props` emits `chat_template_caps` even under `--no-jinja`, so the reader states tools; the server's 400 is
// the first signal, and it must tell the user what to change rather than echo an upstream flag name.
test("a llama.cpp 'tools param requires --jinja flag' 400 reaches the caller as a readable, typed refusal", async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { code: 400, message: "tools param requires --jinja flag", type: "invalid_request_error" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
  const connection = fakeResolved({
    task: "chat",
    providerId: "llama-cpp",
    model: "qwen2.5-0.5b",
    capability: generationCapability({ tools: { parallel: true } }),
    baseUrl: "http://127.0.0.1:8080/v1",
    secret: fakeApiKeySecret("not-a-real-key"),
  });
  const failure = await runOpenAiCompatChatTurn(orRequest({ connection }), turnDeps(fetchImpl)).then(
    () => null,
    (err: unknown) => err,
  );
  expect(failure).toBeInstanceOf(ProviderError);
  const error = failure as ProviderError;
  expect(error.kind).toBe("invalid");
  expect(error.retryable).toBe(false);
  expect(error.message).toContain(
    "this llama.cpp server runs without --jinja, so tool calls are off; start it with --jinja, or under Advanced press Override on tool calls and choose no",
  );
  // PLANTED CONTROL: the same 400 on a turn that carried no tools is an ordinary upstream refusal.
  const bare = await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined }), turnDeps(fetchImpl)).then(
    () => null,
    (err: unknown) => err,
  );
  expect((bare as ProviderError).message).not.toContain("tool calls are off");
});

// ── the structured plan on the chat path ─────────────────────────────────────────────────────────────────────

/** A schema with a number bound, a pattern-free string and the projector's dialect key, so each mode's scrub shows. */
const PLANNED_FORMAT = {
  name: "row",
  schema: wireSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { ratio: { type: "number", minimum: 0, maximum: 1 }, count: { type: "integer", minimum: 1 } },
    required: ["ratio", "count"],
  }),
};

function localRequest(providerId: string, capability = generationCapability()): OpenAiCompatChatRequest {
  const connection = fakeResolved({ task: "chat", providerId, model: "m", capability, baseUrl: "http://127.0.0.1:1/v1" });
  return orRequest({ connection, tools: undefined, responseFormat: PLANNED_FORMAT });
}

test("a llama.cpp row's response_format carries the gbnf scrub: a number's range becomes its note, an integer's stays", async () => {
  const body = await sentBody(localRequest("llama-cpp"));
  const format = body["response_format"] as { readonly json_schema: { readonly schema: Record<string, unknown>; readonly strict: unknown } };
  expect(format.json_schema.strict).toBe(false);
  expect(format.json_schema.schema).not.toHaveProperty("$schema");
  expect(format.json_schema.schema["additionalProperties"]).toBe(false);
  const props = format.json_schema.schema["properties"] as Record<string, Record<string, unknown>>;
  expect(props["ratio"]).toEqual({ type: "number", description: "[Constraints: minimum: 0, maximum: 1]" });
  expect(props["count"]).toEqual({ type: "integer", minimum: 1 });
});

test("an Ollama native body's `format` holds the same gbnf-scrubbed schema", async () => {
  const llama = await sentBody(localRequest("llama-cpp"));
  // The native route reads Ollama's own NDJSON answer, which this OpenAI stream is not: only the request matters here.
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(localRequest("ollama"), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded))).catch(() => undefined);
  const llamaSchema = (llama["response_format"] as { readonly json_schema: { readonly schema: unknown } }).json_schema.schema;
  expect(recorded[0]?.body["format"]).toEqual(llamaSchema);
});

test("a Claude id over OpenRouter past the union ceiling rides one offered tool; with no tools it is refused before fetch", async () => {
  const catalog = curatedRows({
    model: "anthropic/claude-sonnet-5.5",
    providerId: castId<ProviderId>("openrouter"),
    wire: "openai-compat",
    api: "chat-completions",
  });
  const { capability } = synthesizeCapability("generation", "anthropic", { curated: catalog });
  const wide = {
    name: "wide",
    schema: wireSchema({
      type: "object",
      properties: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${String(i)}`, { type: "string" }])),
      required: [],
    }),
  };
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5.5",
    capability,
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const offered = await sentBody(orRequest({ connection, tools: undefined, responseFormat: wide }));
  expect(offered).not.toHaveProperty("response_format");
  expect(offered["tool_choice"]).toBe("auto");
  expect(offered["tools"]).toMatchObject([{ function: { name: "wide" } }]);

  if (capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  const { tools: _tools, ...noTools } = capability.generation;
  const recorded: RecordedRequest[] = [];
  const failure = await runOpenAiCompatChatTurn(
    orRequest({ connection: { ...connection, capability: { kind: "generation", generation: noTools } }, tools: undefined, responseFormat: wide }),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  ).catch((err: unknown) => err);
  expect(recorded).toEqual([]);
  expect(failure).toMatchObject({ detail: "schema_rejected", violations: [{ kind: "union-props", count: 20, limit: 16 }] });
});

test("a structured chat turn under strict-compatible answers with the reply normalized at the reshaped paths only", async () => {
  const format = {
    name: "row",
    schema: wireSchema({
      type: "object",
      properties: { verdict: { anyOf: [{ type: "string" }, { type: "null" }] }, note: { type: "string" } },
      required: ["verdict"],
    }),
  };
  const connection = fakeResolved({
    task: "chat",
    providerId: "openai",
    model: "gpt-5.5",
    capability: generationCapability(),
    baseUrl: "http://127.0.0.1:1/v1",
  });
  const turn = await runOpenAiCompatChatTurn(
    orRequest({ connection, tools: undefined, responseFormat: format }),
    turnDeps(scriptedSseFetch([openAiTextStream('{"verdict":null,"note":null}')], [])),
  );
  expect(JSON.parse(turn.reply)).toEqual({ verdict: null });
});
