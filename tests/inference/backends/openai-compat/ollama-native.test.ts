// backends/openai-compat/ollama-native — an Ollama row's chat turn rides `/api/chat` (D296). The request side is
// pinned on the body that reaches the wire; the reply side replays what the rig's Ollama wrote, byte for byte
// (`_ollama-native-recordings.ts`), through the real SDK and the real turn, so a translation slip shows as a
// wrong reply, tool call, reasoning or usage.

import type { Capability } from "@orb/contracts/inference";
import { builtinProvider, foldFeatures } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import type { BatchDeps } from "../../../../packages/inference/src/backends/openai-compat/batch.ts";
import { runOpenAiCompatStructured, runOpenAiCompatSummarize } from "../../../../packages/inference/src/backends/openai-compat/batch.ts";
import { runOpenAiCompatChatTurn } from "../../../../packages/inference/src/backends/openai-compat/chat.ts";
import { ollamaNativeFetch, toOllamaChat } from "../../../../packages/inference/src/backends/openai-compat/ollama-native.ts";
import { samplerBodyKeys } from "../../../../packages/inference/src/backends/openai-compat/sampling.ts";
import type { ChatResult, OpenAiCompatChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";
import { fakeResolved } from "../../_support.ts";
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
  });
  return { result, recorded };
}

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

test("a recorded tool call comes back as a tool call, and its replay reaches the server as Ollama spells it", async () => {
  const { result, recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.tools], { tools: [WEATHER] });
  expect(recorded[0]?.body["tools"]).toEqual([{ type: "function", function: WEATHER }]);
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
    { role: "tool", content: "18C and clear", ["tool_name"]: "get_weather" },
  ]);
});

test("recorded thinking comes back as reasoning, apart from the answer", async () => {
  const thinking = capability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });
  const { result, recorded } = await turn([OLLAMA_NATIVE_RECORDINGS.think], {
    connection: fakeResolved({ task: "chat", providerId: "ollama", model: "qwen3:0.6b", capability: thinking, baseUrl: BASE_URL }),
    params: { effort: "low" },
  });
  expect(recorded[0]?.body["think"]).toBe(true);
  expect(result.reasoning).toBe("Okay, the");
  expect(result.reply).toBe("2 + 3 = 5.");
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
  const res = await ollamaNativeFetch(inner, { baseUrl: BASE_URL, label: "t" })(`${BASE_URL}/chat/completions`, { method: "POST", body: "{}" });
  expect(res.headers.get("content-type")).toBe("application/json");
  expect(await res.json()).toMatchObject({
    choices: [{ message: { role: "assistant", content: '{\n  "city": "Paris"\n}' }, ["finish_reason"]: "stop" }],
    usage: { ["prompt_tokens"]: 37, ["completion_tokens"]: 10, ["prompt_tokens_details"]: { ["cached_tokens"]: 24 } },
  });
});

/** An Ollama `/api/chat`: it streams NDJSON unless the body says `stream: false`, which gets one JSON object. */
function ollamaServer(posted: RecordedRequest[]): typeof fetch {
  return (input, init): Promise<Response> => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>;
    posted.push({ url: String(input), body });
    const recording = body["stream"] === false ? OLLAMA_NATIVE_RECORDINGS.format : OLLAMA_NATIVE_RECORDINGS.text;
    return Promise.resolve(new Response(recording.body, { status: recording.status, headers: { "content-type": recording.contentType } }));
  };
}

function batchDeps(posted: RecordedRequest[]): BatchDeps {
  return {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: ollamaServer(posted), app: { name: "t", url: "http://localhost:0" } },
    normalize: passthroughImageNormalizer,
  };
}

const PARIS = '{\n  "city": "Paris"\n}';

// The batch tasks call the SDK's non-streaming generate, which sends no `stream` key, and Ollama streams unless
// told not to.
test("a summarize call asks Ollama not to stream and reads the one JSON answer", async () => {
  const posted: RecordedRequest[] = [];
  const connection = fakeResolved({ task: "summarize", providerId: "ollama", model: "qwen2.5:0.5b", capability: capability(), baseUrl: BASE_URL });
  const result = await runOpenAiCompatSummarize(
    { connection, inputs: [{ systemPrompt: "Summarize.", userPrompt: "A long text." }], signal: undefined },
    batchDeps(posted),
  );
  expect(posted[0]?.body["stream"]).toBe(false);
  expect(result.items[0]).toMatchObject({ text: PARIS, usage: { tokensIn: 37, tokensOut: 10 } });
});

test("a structured call asks Ollama not to stream, sends the schema as `format`, and reads the answer", async () => {
  const posted: RecordedRequest[] = [];
  const connection = fakeResolved({ task: "structured", providerId: "ollama", model: "qwen2.5:0.5b", capability: capability(), baseUrl: BASE_URL });
  const schema = wireSchema({ type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false });
  const result = await runOpenAiCompatStructured(
    {
      connection,
      inputs: [{ systemPrompt: "Extract.", userPrompt: "France." }],
      responseFormat: { name: "capital", schema, vehicle: "response-format" },
      signal: undefined,
    },
    batchDeps(posted),
  );
  expect(posted[0]?.body["stream"]).toBe(false);
  expect(posted[0]?.body["format"]).toMatchObject({ type: "object", properties: { city: { type: "string" } } });
  expect(JSON.parse(result.items[0]?.text ?? "{}")).toEqual({ city: "Paris" });
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
  const res = await ollamaNativeFetch(inner, { baseUrl: BASE_URL, label: "t" })(`${BASE_URL}/chat/completions`, { method: "POST", body: "{}" });
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
  const res = await ollamaNativeFetch(inner, { baseUrl: BASE_URL, label: "t" })(`${BASE_URL}/chat/completions`, { method: "POST", body: "{}" });
  const text = await Promise.race([
    res.text(),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("HUNG"), 2000);
    }),
  ]);
  expect(text).toContain('"content":"hello"');
  expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
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
  });
  expect(recorded[0]?.url).toBe("http://127.0.0.1:11434/v1/chat/completions");
});
