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
// @orb-waive-file no-test-fabrication({ role?: string }): baselined when the gate widened to value casts; burn-down item 906.
import type { ProviderId } from "@orb/contracts/inference";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, openRouterReasoningToolStream, scriptedSseFetch } from "../_hosted-support.ts";
import type { ChatResult } from "./_chat-support.ts";
import { curatedRows, orRequest, REASONING, runOpenAiCompatChatTurn, sentBody, synthesizeCapability, turnDeps, warningCodes } from "./_chat-support.ts";

const SIGNATURE = "sig-anthropic-claude-v1";

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

function assistantRowOf(recorded: RecordedRequest): Record<string, unknown> {
  const messages = recorded.body["messages"];
  const row = Array.isArray(messages) ? messages.find((m: unknown) => (m as { role?: string }).role === "assistant") : undefined;
  // @orb-waive no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
  return (row ?? {}) as Record<string, unknown>;
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
