// backends/openai-compat/ollama-native — an Ollama row's chat turn rides `/api/chat` (D296). The request side is
// pinned on the body that reaches the wire; the reply side replays what the rig's Ollama wrote, byte for byte
// (`_ollama-native-recordings.ts`), through the real SDK and the real turn, so a translation slip shows as a
// wrong reply, tool call, reasoning or usage.

import type { Capability, GenerationCapability } from "@orb/contracts/inference";
import { builtinProvider, foldFeatures } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { SummarizeResult } from "@orb/contracts/providers";
import { stateRoundChangesSchema, structuredChangesToToolCalls } from "@orb/contracts/rpg";
import { runOpenAiCompatChatTurn } from "../../../../packages/inference/src/backends/openai-compat/chat.ts";
import { createOpenAiCompatBackend } from "../../../../packages/inference/src/backends/openai-compat/index.ts";
import { fromOllamaChat, ollamaNativeFetch, toOllamaChat } from "../../../../packages/inference/src/backends/openai-compat/ollama-native.ts";
import { samplerBodyKeys } from "../../../../packages/inference/src/backends/openai-compat/sampling.ts";
import type { WireCaptureSink } from "../../../../packages/inference/src/contract/backend.ts";
import type { ChatResult, OpenAiCompatChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { withPresetWindow } from "../../../../packages/inference/src/contract/resolved.ts";
import type { StructuredRequest, SummarizeRequest } from "../../../../packages/inference/src/contract/roles.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";
import { fakeResolved, memoryStores, memoryTokenLexicon } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability } from "../_hosted-support.ts";
import { OLLAMA_NATIVE_RECORDINGS } from "./_ollama-native-recordings.ts";

const NOW = 1_700_000_000_000;
const BASE_URL = "http://127.0.0.1:11434/v1";
const WINDOW = 8192;
const RED_PNG = "iVBORw0KGgo=";
/** The sampler keys the shipped ollama row spells, which the translator moves into `options`. */
const OLLAMA_SAMPLER_KEYS = samplerBodyKeys(foldFeatures(builtinProvider("ollama")?.features));
const WEATHER = { name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } };

type Recording = (typeof OLLAMA_NATIVE_RECORDINGS)[keyof typeof OLLAMA_NATIVE_RECORDINGS];

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

/** The native route as `wrapFetch` composes it: rerouted to `/api/chat`, then the reply translated. */
function nativeChatFetch(inner: typeof fetch): typeof fetch {
  const routed = ollamaNativeFetch(inner, { baseUrl: BASE_URL });
  return async (input, init): Promise<Response> => await fromOllamaChat(await routed(input, init), "t");
}

/** Answers each call with the next recording, as the server sent it, and records what was posted. */
function replay(recordings: readonly Recording[], recorded: RecordedRequest[]): typeof fetch {
  let call = 0;
  return (input, init): Promise<Response> => {
    const recording = recordings[Math.min(call, recordings.length - 1)];
    call += 1;
    recorded.push({ url: String(input), body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> });
    return Promise.resolve(
      new Response(recording?.body ?? "", { status: recording?.status ?? 500, headers: { "content-type": recording?.contentType ?? "text/plain" } }),
    );
  };
}

function capability(over: Parameters<typeof generationCapability>[0] = {}): Capability {
  return generationCapability({
    reasoning: { mode: "none", enabled: false },
    sampling: { temperature: { min: 0, max: 2 } },
    context: { window: WINDOW },
    ...over,
  });
}

function request(over: Partial<Omit<OpenAiCompatChatRequest, "chatId" | "onDelta">> = {}): OpenAiCompatChatRequest {
  return {
    api: "chat-completions",
    connection: fakeResolved({ task: "chat", providerId: "ollama", model: "qwen2.5:0.5b", capability: capability(), baseUrl: BASE_URL }),
    params: { temperature: 0, maxOutputTokens: 64 } satisfies UserIntent,
    systemPrompt: { static: "You are terse.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Say hello." }] }],
    ...over,
  };
}

async function turn(
  recordings: readonly Recording[],
  over: Partial<Omit<OpenAiCompatChatRequest, "chatId" | "onDelta">> = {},
): Promise<{ readonly result: ChatResult; readonly recorded: RecordedRequest[] }> {
  const recorded: RecordedRequest[] = [];
  const result = await runOpenAiCompatChatTurn(request(over), {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: replay(recordings, recorded), app: { name: "t", url: "http://localhost:0" } },
    tokens: memoryTokenLexicon(),
  });
  return { result, recorded };
}

// An unpinned model resolves to the server's floor, which the native route would send as `num_ctx`: the preset's
// Max context is what goes out instead, up to the trained maximum.
test("an Ollama turn sends the preset's Max context as num_ctx, up to the trained maximum", async () => {
  const floor = fakeResolved({
    task: "chat",
    providerId: "ollama",
    model: "qwen2.5:0.5b",
    capability: capability({ context: { window: 4096, windowEstimated: true, settable: { max: 32_768 } } }),
    baseUrl: BASE_URL,
  });
  const numCtx = async (maxContextTokens: number | undefined): Promise<unknown> => {
    const { recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.text], { connection: withPresetWindow(floor, maxContextTokens) });
    return (recorded[0]?.body["options"] as Record<string, unknown> | undefined)?.["num_ctx"];
  };

  expect(await numCtx(16_384)).toBe(16_384);
  expect(await numCtx(65_536)).toBe(32_768);
  expect(await numCtx(undefined)).toBe(4096);
});

test("an Ollama turn posts /api/chat with the window as num_ctx and the samplers in options", async () => {
  const { result, recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.text]);
  expect(recorded[0]?.url).toBe("http://127.0.0.1:11434/api/chat");
  const body = recorded[0]?.body ?? {};
  expect(body["model"]).toBe("qwen2.5:0.5b");
  expect(body["stream"]).toBe(true);
  expect(body["options"]).toMatchObject({ ["num_ctx"]: WINDOW, temperature: 0, ["num_predict"]: 64 });
  expect(body["messages"]).toEqual([
    { role: "system", content: "You are terse." },
    { role: "user", content: "Say hello." },
  ]);
  for (const openAiOnly of ["max_tokens", "temperature", "stream_options", "response_format", "tool_choice"]) {
    expect(Object.hasOwn(body, openAiOnly), openAiOnly).toBe(false);
  }
  // The recorded stream reads back as the reply and the usage Ollama counted.
  expect(result.reply).toBe("Hello, how are you?");
  expect(result.finishReason).toBe("stop");
  expect(result.usage).toMatchObject({ tokensIn: 35, tokensOut: 7 });
});

test("the connection's keep_alive rides the top level and its num_batch rides options; unset, neither is sent", async () => {
  const declared = fakeResolved({
    task: "chat",
    providerId: "ollama",
    model: "qwen2.5:0.5b",
    capability: capability(),
    baseUrl: BASE_URL,
    declaredFeatures: { keepAlive: "30m", numBatch: 256 },
  });
  const set = (await turn([OLLAMA_NATIVE_RECORDINGS.text], { connection: declared })).recorded[0]?.body ?? {};
  expect(set["keep_alive"]).toBe("30m");
  expect(set["options"]).toMatchObject({ ["num_batch"]: 256 });
  expect(set["options"]).not.toHaveProperty("keep_alive");

  const unset = (await turn([OLLAMA_NATIVE_RECORDINGS.text])).recorded[0]?.body ?? {};
  expect(unset).not.toHaveProperty("keep_alive");
  expect(unset["options"]).not.toHaveProperty("num_batch");
});

test("a recorded tool call comes back as a tool call, and its replay reaches the server as Ollama spells it", async () => {
  const { result, recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.tools], { tools: [WEATHER] });
  // The tool's parameters ride in the row's grammar vocabulary (gbnf): the object is pinned closed, as llama.cpp reads it.
  expect(recorded[0]?.body["tools"]).toEqual([
    { type: "function", function: { ...WEATHER, parameters: { ...WEATHER.parameters, additionalProperties: false } } },
  ]);
  expect(result.toolCalls).toEqual([{ toolCallId: "call_s4210pyw", name: "get_weather", arguments: '{"city":"Paris"}' }]);
  expect(result.finishReason).toBe("tool");

  const replayed = toOllamaChat(
    {
      model: "qwen2.5:0.5b",
      messages: [
        {
          role: "assistant",
          content: "",
          ["tool_calls"]: [{ id: "call_s4210pyw", type: "function", function: { name: "get_weather", arguments: '{"city":"Paris"}' } }],
        },
        { role: "tool", ["tool_call_id"]: "call_s4210pyw", content: "18C and clear" },
      ],
    },
    { numCtx: WINDOW, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t" },
  );
  expect(replayed["messages"]).toEqual([
    { role: "assistant", content: "", ["tool_calls"]: [{ id: "call_s4210pyw", function: { name: "get_weather", arguments: { city: "Paris" } } }] },
    { role: "tool", content: "18C and clear", ["tool_name"]: "get_weather", ["tool_call_id"]: "call_s4210pyw" },
  ]);
});

test("two calls of one tool answered in reverse order keep each result paired with its own call id", () => {
  const replayed = toOllamaChat(
    {
      messages: [
        {
          role: "assistant",
          ["tool_calls"]: [
            { id: "call_a", type: "function", function: { name: "get_weather", arguments: '{"city":"Boise"}' } },
            { id: "call_b", type: "function", function: { name: "get_weather", arguments: '{"city":"Nampa"}' } },
          ],
        },
        { role: "tool", ["tool_call_id"]: "call_b", content: "Nampa sunny" },
        { role: "tool", ["tool_call_id"]: "call_a", content: "Boise rainy" },
        // A result naming no call stays bare: no invented id or name.
        { role: "tool", content: "orphan" },
      ],
    },
    { numCtx: WINDOW, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t" },
  );
  expect(replayed["messages"]).toEqual([
    {
      role: "assistant",
      content: "",
      ["tool_calls"]: [
        { id: "call_a", function: { name: "get_weather", arguments: { city: "Boise" } } },
        { id: "call_b", function: { name: "get_weather", arguments: { city: "Nampa" } } },
      ],
    },
    { role: "tool", content: "Nampa sunny", ["tool_name"]: "get_weather", ["tool_call_id"]: "call_b" },
    { role: "tool", content: "Boise rainy", ["tool_name"]: "get_weather", ["tool_call_id"]: "call_a" },
    { role: "tool", content: "orphan" },
  ]);
});

test("recorded thinking comes back as reasoning, apart from the answer", async () => {
  const thinking = capability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });
  const { result, recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.think], {
    connection: fakeResolved({ task: "chat", providerId: "ollama", model: "qwen3:0.6b", capability: thinking, baseUrl: BASE_URL }),
    params: { effort: "low" },
  });
  // The capability names effort levels, so `think` carries the level (Ollama reads any named level as "think").
  expect(recorded[0]?.body["think"]).toBe("low");
  expect(result.reasoning).toBe("Okay, the");
  expect(result.reply).toBe("2 + 3 = 5.");
});

test("a folded turn with reasoning unset sends think false; unfolded, the server's default stands", async () => {
  // With no `think` field Ollama runs a thinking model's default, and a template that thinks answers a folded turn
  // with the state calls alone.
  const thinking = capability({ reasoning: { mode: "effort", enabled: true } });
  const thinkSent = async (params: UserIntent, terminalToolsAttached: boolean): Promise<unknown> => {
    const { recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.text], {
      connection: fakeResolved({ task: "chat", providerId: "ollama", model: "qwen3:0.6b", capability: thinking, baseUrl: BASE_URL }),
      params,
      ...(terminalToolsAttached ? { terminalToolsAttached } : {}),
    });
    return recorded[0]?.body["think"];
  };
  expect(await thinkSent({}, true)).toBe(false);
  expect(await thinkSent({}, false)).toBeUndefined();
  expect(await thinkSent({ effort: "high" }, true)).toBe(true);
});

test("a think the user's own body sets stands over the computed one, on the Ollama row and on a Custom row detected as Ollama", async () => {
  const thinking = capability({ reasoning: { mode: "effort", enabled: true } });
  const ollama = fakeResolved({ task: "chat", providerId: "ollama", model: "qwen3:0.6b", capability: thinking, baseUrl: BASE_URL });
  const custom = fakeResolved({ task: "chat", providerId: "custom-openai", model: "qwen3:0.6b", capability: thinking, baseUrl: BASE_URL });
  // Detection folds the registered row, then the detected one (`behavedFeatures`).
  const detected = { ...custom, features: foldFeatures(builtinProvider("custom-openai")?.features, builtinProvider("ollama")?.features) };
  const cases = [
    { name: "folded, unset, includeBody", connection: { ...ollama, transport: { includeBody: { think: true } } }, params: {}, folded: true },
    { name: "folded, unset, extras", connection: { ...ollama, extras: { think: true } }, params: {}, folded: true },
    {
      name: "unfolded, chosen off, includeBody",
      connection: { ...ollama, transport: { includeBody: { think: true } } },
      params: { effort: "none" },
      folded: false,
    },
    { name: "detected, folded, unset, includeBody", connection: { ...detected, transport: { includeBody: { think: true } } }, params: {}, folded: true },
  ] satisfies { name: string; connection: OpenAiCompatChatRequest["connection"]; params: UserIntent; folded: boolean }[];
  for (const { name, connection, params, folded } of cases) {
    const { recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.text], { connection, params, ...(folded ? { terminalToolsAttached: true } : {}) });
    expect(recorded[0]?.url, name).toBe("http://127.0.0.1:11434/api/chat");
    expect(recorded[0]?.body["think"], name).toBe(true);
  }
});

test("a think the user excluded stays absent, folded or chosen, on the Ollama row and on a Custom row detected as Ollama", async () => {
  const thinking = capability({ reasoning: { mode: "effort", enabled: true } });
  const ollama = fakeResolved({ task: "chat", providerId: "ollama", model: "qwen3:0.6b", capability: thinking, baseUrl: BASE_URL });
  const custom = fakeResolved({ task: "chat", providerId: "custom-openai", model: "qwen3:0.6b", capability: thinking, baseUrl: BASE_URL });
  const detected = { ...custom, features: foldFeatures(builtinProvider("custom-openai")?.features, builtinProvider("ollama")?.features) };
  const turns = [
    { params: {}, folded: true },
    { params: { effort: "none" }, folded: false },
    { params: { effort: "low" }, folded: false },
  ] satisfies { params: UserIntent; folded: boolean }[];
  for (const [row, base] of [
    ["ollama", ollama],
    ["detected", detected],
  ] as const) {
    for (const { params, folded } of turns) {
      const { recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.text], {
        connection: { ...base, transport: { excludeBody: ["think"] } },
        params,
        ...(folded ? { terminalToolsAttached: true } : {}),
      });
      expect(Object.hasOwn(recorded[0]?.body ?? {}, "think"), `${row} ${JSON.stringify(params)} folded=${String(folded)}`).toBe(false);
    }
  }
});

test("every native key the user's body sets or excludes is theirs over the wire: keep_alive, format, stream, options", async () => {
  const ollama = fakeResolved({
    task: "chat",
    providerId: "ollama",
    model: "qwen2.5:0.5b",
    capability: capability(),
    baseUrl: BASE_URL,
    declaredFeatures: { keepAlive: "30m", numBatch: 256 },
  });
  const custom = fakeResolved({ task: "chat", providerId: "custom-openai", model: "qwen2.5:0.5b", capability: capability(), baseUrl: BASE_URL });
  const detected = { ...custom, features: foldFeatures(builtinProvider("custom-openai")?.features, builtinProvider("ollama")?.features, { keepAlive: "30m" }) };
  const schema = wireSchema({ type: "object", properties: { mood: { type: "string" } }, required: ["mood"], additionalProperties: false });
  for (const [row, base] of [
    ["ollama", ollama],
    ["detected", detected],
  ] as const) {
    const set = await turn([OLLAMA_NATIVE_RECORDINGS.text], {
      connection: { ...base, transport: { includeBody: { keep_alive: "5m", format: "json" } } },
      responseFormat: { name: "mood", schema },
    });
    const sent = set.recorded[0]?.body ?? {};
    expect([sent["keep_alive"], sent["format"]], row).toEqual(["5m", "json"]);
    const dropped = await turn([OLLAMA_NATIVE_RECORDINGS.text], {
      connection: { ...base, transport: { excludeBody: ["format", "stream", "options"] } },
      responseFormat: { name: "mood", schema },
    });
    const bare = dropped.recorded[0]?.body ?? {};
    expect(
      ["format", "stream", "options"].filter((key) => Object.hasOwn(bare, key)),
      row,
    ).toEqual([]);
  }
});

test("toOllamaChat: a user-owned key stands as set or stays excluded; a user options object takes ours under it", () => {
  const args = { numCtx: WINDOW, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t", keepAlive: "30m", numBatch: 256 };
  const theirs = [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://cdn/x.png" } }] }];
  const set = toOllamaChat(
    { messages: theirs, stream: "yes", format: "json", ["keep_alive"]: "5m", options: { ["num_ctx"]: 2048 }, ["response_format"]: { type: "json_object" } },
    { ...args, userOwned: new Set(["messages", "stream", "format", "keep_alive", "options"]) },
  );
  expect(set).toMatchObject({ messages: theirs, stream: "yes", format: "json", ["keep_alive"]: "5m" });
  expect(set["options"]).toEqual({ ["num_ctx"]: 2048, ["num_batch"]: 256 });
  const excluded = toOllamaChat(
    { messages: [], ["reasoning_effort"]: "none", ["response_format"]: { type: "json_object" } },
    { ...args, userOwned: new Set(["think", "format", "stream", "options", "keep_alive"]) },
  );
  expect(["think", "format", "stream", "options", "keep_alive"].filter((key) => Object.hasOwn(excluded, key))).toEqual([]);
});

test("a model whose reasoning is mandatory (gpt-oss) is never told off on a folded turn with reasoning unset", async () => {
  const mandatory = capability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], mandatory: true } });
  const { recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.text], {
    connection: fakeResolved({ task: "chat", providerId: "ollama", model: "gpt-oss:20b", capability: mandatory, baseUrl: BASE_URL }),
    params: {},
    terminalToolsAttached: true,
  });
  expect(recorded[0]?.body["think"]).not.toBe(false);
});

test("think: a model with named effort levels (gpt-oss) gets the level, any other model on/off, and none turns it off", () => {
  const body = (effort: string): Record<string, unknown> => ({ messages: [{ role: "user", content: "hi" }], ["reasoning_effort"]: effort });
  const args = { numCtx: undefined, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t" };
  const named = ["low", "medium", "high"] as const;
  expect(toOllamaChat(body("high"), { ...args, think: { effort: "high", levels: named } })["think"]).toBe("high");
  expect(toOllamaChat(body("high"), { ...args, think: { effort: "high" } })["think"]).toBe(true);
  expect(toOllamaChat(body("none"), { ...args, think: { levels: named } })["think"]).toBe(false);
  expect(toOllamaChat({ messages: [] }, { ...args, think: { levels: named } })["think"]).toBeUndefined();
  // The native spelling is the model's own: `max` stays `max`, never the OpenAI route's `xhigh`.
  expect(toOllamaChat(body("xhigh"), { ...args, think: { effort: "max", levels: [...named, "max"] } })["think"]).toBe("max");
  // An on/off-only model the turn switched on gets `true`; a word the user's own body set rides as they wrote it.
  expect(toOllamaChat({ messages: [] }, { ...args, think: { levels: [], on: true } })["think"]).toBe(true);
  expect(toOllamaChat(body("deep"), { ...args, think: { effort: "high", levels: named }, userOwned: new Set(["reasoning_effort"]) })["think"]).toBe("deep");
});

test("a chosen effort reaches Ollama in the model's own spelling, and the turn records what was sent, not what was asked", async () => {
  const sent = async (
    reasoning: GenerationCapability["reasoning"],
    params: UserIntent,
  ): Promise<{ readonly think: unknown; readonly applied: ChatResult["appliedEffort"]; readonly warnings: readonly string[] }> => {
    const { result, recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.text], {
      connection: fakeResolved({ task: "chat", providerId: "ollama", model: "qwen3:0.6b", capability: capability({ reasoning }), baseUrl: BASE_URL }),
      params,
    });
    const warnings = result.events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
    return { think: recorded[0]?.body["think"], applied: result.appliedEffort, warnings };
  };
  const named: GenerationCapability["reasoning"] = { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high", "max"] };
  expect(await sent(named, { effort: "max" })).toEqual({ think: "max", applied: "max", warnings: [] });
  expect(await sent(named, { effort: "low" })).toEqual({ think: "low", applied: "low", warnings: [] });
  expect(await sent(named, { effort: "none" })).toMatchObject({ think: false, applied: "none" });
  // On/off only: the level is dropped loudly, thinking is switched on, and no level is recorded.
  const onOff = await sent({ mode: "effort", enabled: true, effortLevels: [] }, { effort: "low" });
  expect(onOff).toMatchObject({ think: true, applied: null });
  expect(onOff.warnings).toContain("effort_dropped");
  // No descriptor: the level cannot be spelled, so thinking goes on without one, and the turn says so.
  const unstated = await sent({ mode: "effort", enabled: true }, { effort: "low" });
  expect(unstated).toMatchObject({ think: true, applied: null });
  expect(unstated.warnings).toContain("effort_dropped");
});

test("an image part travels as base64 in `images`, and an image URL is refused before the send", () => {
  const body = toOllamaChat(
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What colour?" },
            { type: "image_url", ["image_url"]: { url: `data:image/png;base64,${RED_PNG}` } },
          ],
        },
      ],
    },
    { numCtx: WINDOW, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t" },
  );
  expect(body["messages"]).toEqual([{ role: "user", content: "What colour?", images: [RED_PNG] }]);
  expect(() =>
    toOllamaChat(
      { messages: [{ role: "user", content: [{ type: "image_url", ["image_url"]: { url: "https://cas.test/a.png" } }] }] },
      { numCtx: WINDOW, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t" },
    ),
  ).toThrow(ProviderError);
});

test("a JSON schema becomes `format`, effort becomes `think`, and an includeBody `options` wins key by key", () => {
  const body = toOllamaChat(
    {
      model: "m",
      messages: [],
      ["response_format"]: { type: "json_schema", ["json_schema"]: { name: "x", schema: { type: "object" } } },
      ["reasoning_effort"]: "none",
      ["top_k"]: 40,
      ["keep_alive"]: "10m",
      options: { ["num_ctx"]: 2048 },
    },
    { numCtx: WINDOW, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t" },
  );
  expect(body["format"]).toEqual({ type: "object" });
  expect(body["think"]).toBe(false);
  expect(body["keep_alive"]).toBe("10m");
  expect(body["options"]).toEqual({ ["top_k"]: 40, ["num_ctx"]: 2048 });
  expect(toOllamaChat({ ["response_format"]: { type: "json_object" } }, { numCtx: undefined, samplerKeys: OLLAMA_SAMPLER_KEYS, label: "t" })["format"]).toBe(
    "json",
  );
});

test("a recorded non-streaming answer (the structured path) reads back as one OpenAI completion", async () => {
  const recording = OLLAMA_NATIVE_RECORDINGS.format;
  const inner: typeof fetch = () =>
    Promise.resolve(new Response(recording.body, { status: recording.status, headers: { "content-type": recording.contentType } }));
  const res = await nativeChatFetch(inner)(`${BASE_URL}/chat/completions`, { method: "POST", body: "{}" });
  expect(res.headers.get("content-type")).toBe("application/json");
  expect(await res.json()).toMatchObject({
    choices: [{ message: { role: "assistant", content: '{\n  "city": "Paris"\n}' }, ["finish_reason"]: "stop" }],
    usage: { ["prompt_tokens"]: 37, ["completion_tokens"]: 10, ["prompt_tokens_details"]: { ["cached_tokens"]: 24 } },
  });
});

/** A recorded non-streamed answer as the one NDJSON line a streamed request reads: the server's own object, which
 *  carries the same fields as a stream's final line. */
function streamedOf(recording: Recording): Response {
  return new Response(`${JSON.stringify(JSON.parse(recording.body))}\n`, { status: recording.status, headers: { "content-type": "application/x-ndjson" } });
}

/** An Ollama `/api/chat` answering every request with `recording` as one streamed line, recording what was posted. */
function ollamaServer(posted: RecordedRequest[], recording: Recording = OLLAMA_NATIVE_RECORDINGS.format): typeof fetch {
  return (input, init): Promise<Response> => {
    posted.push({ url: String(input), body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> });
    return Promise.resolve(streamedOf(recording));
  };
}

/** The wire's side-generation tasks over a scripted Ollama, each item a chat turn on the native route. */
function sideGenOver(fetchImpl: typeof fetch): {
  readonly summarize: (req: SummarizeRequest) => Promise<SummarizeResult>;
  readonly structured: (req: StructuredRequest) => Promise<SummarizeResult>;
} {
  const { summarize, structured } = createOpenAiCompatBackend({
    now: () => NOW,
    log: silentLog(),
    fetch: fetchImpl,
    app: { name: "t", url: "http://localhost:0" },
    snapshotStore: memoryStores().snapshotStore,
  }).backend;
  if (summarize === undefined || structured === undefined) {
    throw new Error("the openai-compat backend serves summarize and structured");
  }
  return { summarize, structured };
}

const PARIS = '{\n  "city": "Paris"\n}';

test("a summarize call streams from Ollama's native route and reads the answer and its usage", async () => {
  const posted: RecordedRequest[] = [];
  const connection = fakeResolved({ task: "summarize", providerId: "ollama", model: "qwen2.5:0.5b", capability: capability(), baseUrl: BASE_URL });
  const result = await sideGenOver(ollamaServer(posted)).summarize({
    connection,
    inputs: [{ systemPrompt: "Summarize.", userPrompt: "A long text." }],
    signal: undefined,
  });
  expect(posted[0]?.body["stream"]).toBe(true);
  expect(result.items[0]).toMatchObject({ text: PARIS, usage: { tokensIn: 37, tokensOut: 10 } });
});

test("a side-generation call spells a chosen max in the model's own word, as a chat turn does", async () => {
  const posted: RecordedRequest[] = [];
  const reasoning: GenerationCapability["reasoning"] = { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high", "max"] };
  const connection = fakeResolved({ task: "summarize", providerId: "ollama", model: "qwen3:0.6b", capability: capability({ reasoning }), baseUrl: BASE_URL });
  await sideGenOver(ollamaServer(posted)).summarize({
    connection,
    inputs: [{ systemPrompt: "Summarize.", userPrompt: "A long text." }],
    effort: "max",
    signal: undefined,
  });
  expect(posted[0]?.body["think"]).toBe("max");
});

test("a structured call sends the schema as `format` on Ollama's native route and reads the answer", async () => {
  const posted: RecordedRequest[] = [];
  const connection = fakeResolved({ task: "structured", providerId: "ollama", model: "qwen2.5:0.5b", capability: capability(), baseUrl: BASE_URL });
  const schema = wireSchema({ type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false });
  const result = await sideGenOver(ollamaServer(posted)).structured({
    connection,
    inputs: [{ systemPrompt: "Extract.", userPrompt: "France." }],
    responseFormat: { name: "capital", schema },
    signal: undefined,
  });
  expect(posted[0]?.body["format"]).toMatchObject({ type: "object", properties: { city: { type: "string" } } });
  expect(JSON.parse(result.items[0]?.text ?? "{}")).toEqual({ city: "Paris" });
});

test("a side-generation call with reasoning off sends `think: false` to a model Ollama says thinks, keeping the visible cap", async () => {
  const posted: RecordedRequest[] = [];
  // What the advertised tier states for a model whose `/api/show` capabilities include `thinking`.
  const thinker = capability({ reasoning: { mode: "effort", enabled: true } });
  const connection = fakeResolved({ task: "structured", providerId: "ollama", model: "gemma4:e4b", capability: thinker, baseUrl: BASE_URL });
  const schema = wireSchema({ type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false });
  await sideGenOver(ollamaServer(posted)).structured({
    connection,
    inputs: [{ systemPrompt: "Extract.", userPrompt: "France." }],
    responseFormat: { name: "capital", schema },
    effort: "none",
    maxTokens: 128,
    signal: undefined,
  });
  expect(posted[0]?.body["think"]).toBe(false);
  expect(posted[0]?.body["options"]).toMatchObject({ num_predict: 128 });
});

test("an image URL refused while the body is translated reaches the caller as the readable ProviderError", async () => {
  const posted: RecordedRequest[] = [];
  const req = request({
    history: [
      {
        role: "user",
        content: [
          { type: "text", text: "What colour?" },
          { type: "image", url: "https://cas.test/a.png" },
        ],
      },
    ],
    connection: fakeResolved({
      task: "chat",
      providerId: "ollama",
      model: "moondream:latest",
      capability: capability({ input: ["text", "image"] }),
      baseUrl: BASE_URL,
    }),
  });
  const failed = runOpenAiCompatChatTurn(req, {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: ollamaServer(posted), app: { name: "t", url: "http://localhost:0" } },
    tokens: memoryTokenLexicon(),
  });
  await expect(failed).rejects.toThrow(/takes inline images only/u);
  await expect(failed).rejects.toBeInstanceOf(ProviderError);
  // Refused in the body translation, before anything reached the server.
  expect(posted).toHaveLength(0);
});

test("cancelling the translated stream cancels Ollama's stream, so an abort reaches the socket", async () => {
  let cancelled = false;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller): void {
      controller.enqueue(new TextEncoder().encode('{"message":{"role":"assistant","content":"a"},"done":false}\n'));
    },
    cancel(): void {
      cancelled = true;
    },
  });
  const inner: typeof fetch = () => Promise.resolve(new Response(endless, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
  const res = await nativeChatFetch(inner)(`${BASE_URL}/chat/completions`, { method: "POST", body: "{}" });
  const reader = res.body?.getReader();
  await reader?.read();
  await reader?.cancel();
  expect(cancelled).toBe(true);
});

test("a line split across three reads still streams to [DONE]", async () => {
  const line = '{"message":{"role":"assistant","content":"hello"},"done":false}\n';
  const cut = Math.floor(line.length / 3);
  const parts = [line.slice(0, cut), line.slice(cut, cut * 2), line.slice(cut * 2)];
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
  const inner: typeof fetch = () => Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
  const res = await nativeChatFetch(inner)(`${BASE_URL}/chat/completions`, { method: "POST", body: "{}" });
  const text = await Promise.race([
    res.text(),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("HUNG"), 2000);
    }),
  ]);
  expect(text).toContain('"content":"hello"');
  expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
});

test("the reply capture holds Ollama's native bytes, while the turn reads them translated, on one entry with the request", async () => {
  const run = async (
    recording: Recording,
  ): Promise<{ readonly entries: Parameters<WireCaptureSink>[0][]; readonly result: ChatResult | undefined; readonly error: unknown }> => {
    const entries: Parameters<WireCaptureSink>[0][] = [];
    const recorded: RecordedRequest[] = [];
    let result: ChatResult | undefined;
    let error: unknown;
    try {
      result = await runOpenAiCompatChatTurn(request(), {
        now: () => NOW,
        log: silentLog(),
        transport: {
          fetch: replay([recording], recorded),
          app: { name: "t", url: "http://localhost:0" },
          captureWire: (entry) => entries.push(entry),
          captureWireReply: true,
        },
        tokens: memoryTokenLexicon(),
      });
    } catch (thrown) {
      error = thrown;
    }
    await expect.poll(() => entries.length).toBe(1);
    return { entries, result, error };
  };
  const ok = await run(OLLAMA_NATIVE_RECORDINGS.text);
  expect(ok.result?.reply).toBe("Hello, how are you?");
  // The native stream's own fields, which the OpenAI reconstruction drops, are what was captured.
  expect(ok.entries[0]?.responseBody).toContain('"prompt_eval_count":35');
  expect(ok.entries[0]?.responseBody).not.toContain("chat.completion.chunk");
  expect(ok.entries[0]?.body).toMatchObject({ messages: expect.any(Array), options: expect.any(Object) });
  // A failed answer captures Ollama's own error body and still reaches the turn as the server's words.
  const failed = await run(OLLAMA_NATIVE_RECORDINGS.missing);
  expect(failed.entries[0]?.responseBody).toBe(OLLAMA_NATIVE_RECORDINGS.missing.body);
  expect(String(failed.error)).toMatch(/no-such-model:latest' not found/u);
});

test("a recorded error answer reaches the turn as the server's own message", async () => {
  const failed = turn([OLLAMA_NATIVE_RECORDINGS.missing]);
  await expect(failed).rejects.toThrow(/no-such-model:latest' not found/u);
});

test("a row that turns the native route off rides /v1 as before", async () => {
  const recorded: RecordedRequest[] = [];
  const connection = fakeResolved({
    task: "chat",
    providerId: "ollama",
    model: "qwen2.5:0.5b",
    capability: capability(),
    baseUrl: BASE_URL,
    declaredFeatures: { nativeChat: "none" },
  });
  const sse = 'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
  const fetchImpl: typeof fetch = (input, init) => {
    recorded.push({ url: String(input), body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> });
    return Promise.resolve(new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
  };
  await runOpenAiCompatChatTurn(request({ connection }), {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: fetchImpl, app: { name: "t", url: "http://localhost:0" } },
    tokens: memoryTokenLexicon(),
  });
  expect(recorded[0]?.url).toBe("http://127.0.0.1:11434/v1/chat/completions");
});

test("0511: the rpg structured state round sends its changes schema as `format`, and the recorded reply decodes to the tool calls", async () => {
  const posted: RecordedRequest[] = [];
  const schema = stateRoundChangesSchema(wireSchema({}), [
    { name: "update_party", description: "Party.", parameters: { type: "object", properties: { targetRef: { type: "string" } }, additionalProperties: false } },
    { name: "no_changes", description: "Nothing.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  ]);
  const connection = fakeResolved({ task: "structured", providerId: "ollama", model: "qwen2.5:0.5b", capability: capability(), baseUrl: BASE_URL });

  const result = await sideGenOver(ollamaServer(posted, OLLAMA_NATIVE_RECORDINGS.stateRound)).structured({
    connection,
    inputs: [{ systemPrompt: "Track state.", userPrompt: "Mira is bleeding." }],
    responseFormat: { name: "rpg_state_changes", schema },
    signal: undefined,
  });

  expect(posted[0]?.url).toBe("http://127.0.0.1:11434/api/chat");
  expect(posted[0]?.body["format"]).toEqual(schema);
  expect(posted[0]?.body).not.toHaveProperty("tools");
  const decoded = structuredChangesToToolCalls(JSON.parse(result.items[0]?.text ?? "null"));
  expect(decoded?.calls.map((call) => call.name)).toEqual(["update_party", "update_inventory"]);
  expect(decoded?.unreadable).toBe(0);
});
