// roles/side-gen — a summarize or structured item is one non-delivered chat turn on the wire's own chat path, so
// a fix to the chat request reaches side generation by construction. Each pin drives the public executor (the
// same dispatch seam production crosses) and asserts on the wire body or the item; each names a divergence the
// separate batch path had from the chat turn.

import type { Capability, ProviderId } from "@orb/contracts/inference";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { castId } from "@orb/kit/ids";
import { curatedRows } from "../../../packages/inference/src/capability/sources/curated/loader.ts";
import { measuredRows } from "../../../packages/inference/src/capability/sources/measured/loader.ts";
import { synthesizeCapability } from "../../../packages/inference/src/capability/synthesize.ts";
import type { ProviderExecutor } from "../../../packages/inference/src/contract/backend.ts";
import type { InferenceLog } from "../../../packages/inference/src/deps.ts";
import { buildBackends } from "../../../packages/inference/src/registry/backends.ts";
import { createProviderExecutor } from "../../../packages/inference/src/roles/executor.ts";
import { expect, test } from "../../support/fixtures.ts";
import { testProviderId } from "../../support/inference-identities.ts";
import { wireSchema } from "../../support/wire-ready.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../_support.ts";
import type { RecordedRequest, SseEvent } from "../backends/_hosted-support.ts";
import { anthropicTextStream, generationCapability } from "../backends/_hosted-support.ts";

const LOCAL_URL = "http://box.local:8080/v1";
const OLLAMA_URL = "http://127.0.0.1:11434/v1";
const NO_REASONING: Capability = generationCapability({ reasoning: { mode: "none", enabled: false } });

interface LogLine {
  readonly level: string;
  readonly fields: Record<string, unknown>;
}

function recordingLog(lines: LogLine[]): InferenceLog {
  const push =
    (level: string): InferenceLog["info"] =>
    (fields): void => {
      lines.push({ level, fields: { ...fields } });
    };
  return { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") };
}

function executorWith(args: { readonly fetch?: typeof fetch; readonly agentSdkQuery?: unknown; readonly lines?: LogLine[] }): ProviderExecutor {
  const deps = fakeDeps({
    claudeExecutable: "/usr/bin/claude",
    log: recordingLog(args.lines ?? []),
    ...(args.fetch !== undefined ? { fetch: args.fetch } : {}),
    ...(args.agentSdkQuery !== undefined ? { agentSdkQuery: args.agentSdkQuery } : {}),
  });
  return createProviderExecutor({ registry: buildBackends(deps).registry, span: deps.span });
}

function warnedCodes(lines: readonly LogLine[]): readonly unknown[] {
  return lines.filter((line) => line.fields["event"] === "provider.resolve-warning").map((line) => line.fields["code"]);
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>;
}

/** What one scripted OpenAI-shaped answer holds: an error status, or a reply with its stop word and token counts. */
interface Reply {
  readonly status?: number;
  readonly error?: string;
  readonly content?: string;
  readonly finish?: string;
  readonly usage?: { readonly prompt: number; readonly completion: number };
}

const DEFAULT_USAGE = { prompt: 10, completion: 5 } as const;
/** The vLLM row's sleep probe, which every task on that row asks first; answered awake and never recorded. */
const SLEEP_PROBE_SUFFIX = "/is_sleeping";

function chunk(choice: Record<string, unknown>, usage?: Record<string, unknown>): SseEvent {
  return {
    event: "",
    data: { id: "gen-side", object: "chat.completion.chunk", created: 1, model: "m", choices: [choice], ...(usage === undefined ? {} : { usage }) },
  };
}

function sse(events: readonly SseEvent[]): string {
  return events.map((e) => `data: ${JSON.stringify(e.data)}\n\n`).join("");
}

/** An OpenAI-shaped server: a streamed request gets chat chunks, a non-streamed one a completion object. */
function openAiServer(recorded: RecordedRequest[], reply: (body: Record<string, unknown>) => Reply): typeof fetch {
  return (input, init): Promise<Response> => {
    if (String(input).endsWith(SLEEP_PROBE_SUFFIX)) {
      return Promise.resolve(Response.json({ is_sleeping: false }));
    }
    const body = bodyOf(init);
    recorded.push({ url: String(input), body });
    const answer = reply(body);
    if (answer.error !== undefined) {
      return Promise.resolve(Response.json({ error: { message: answer.error, code: answer.status } }, { status: answer.status ?? 400 }));
    }
    const content = answer.content ?? "ok";
    const finish = answer.finish ?? "stop";
    const tokens = answer.usage ?? DEFAULT_USAGE;
    const usage = { prompt_tokens: tokens.prompt, completion_tokens: tokens.completion };
    const total = { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens };
    if (body["stream"] === true) {
      const text = sse([
        chunk({ index: 0, delta: { role: "assistant", content }, finish_reason: null }),
        chunk({ index: 0, delta: {}, finish_reason: finish }, total),
      ]);
      return Promise.resolve(new Response(`${text}data: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } }));
    }
    const completion = {
      id: "gen-side",
      object: "chat.completion",
      created: 1,
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }],
      usage: total,
    };
    return Promise.resolve(Response.json(completion));
  };
}

function userTextOf(body: Record<string, unknown>): string {
  return JSON.stringify(body["messages"] ?? []);
}

function openRouterConnection<T extends "summarize" | "structured">(
  task: T,
  model: string,
  extras?: Record<string, unknown>,
): ReturnType<typeof fakeResolved<T>> {
  const query = { model, providerId: castId<ProviderId>("openrouter"), wire: "openai-compat", api: "chat-completions" } as const;
  const { capability } = synthesizeCapability("generation", "anthropic", { curated: curatedRows(query), measured: measuredRows(query) });
  return fakeResolved({
    task,
    providerId: "openrouter",
    model,
    capability,
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
    ...(extras === undefined ? {} : { extras: extras as never }),
  });
}

function localCapability(providerId: string, model: string): Capability {
  return synthesizeCapability("generation", "other", { curated: curatedRows({ model, providerId: testProviderId(providerId), wire: "openai-compat" }) })
    .capability;
}

const ITEM = { systemPrompt: "Summarize.", userPrompt: "A long scene." } as const;

// ── (1) OpenRouter routing and privacy ─────────────────────────────────────────────────────────────────

test("(1) an OpenRouter summarize carries the connection's provider routing, data-collection preference, fallback models and plugins", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: openAiServer(recorded, () => ({})) });
  const extras = { provider: { data_collection: "deny", only: ["Anthropic"] }, models: ["anthropic/claude-sonnet-5", "openai/gpt-5.1"] };
  await executor.summarize({
    connection: openRouterConnection("summarize", "anthropic/claude-sonnet-5", extras),
    inputs: [ITEM],
    effort: "none",
    maxTokens: 128,
  });
  const body = recorded[0]?.body ?? {};
  expect(body["provider"]).toEqual({ data_collection: "deny", only: ["Anthropic"] });
  expect(body["models"]).toEqual(["anthropic/claude-sonnet-5", "openai/gpt-5.1"]);
  expect(body["plugins"]).toEqual([{ id: "context-compression", enabled: false }]);
});

test("(1) an OpenRouter Claude summarize with no routing of its own is pinned to Anthropic, as a chat turn is", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: openAiServer(recorded, () => ({})) });
  await executor.summarize({ connection: openRouterConnection("summarize", "anthropic/claude-sonnet-5"), inputs: [ITEM], effort: "none", maxTokens: 128 });
  expect(recorded[0]?.body["provider"]).toMatchObject({ allow_fallbacks: false });
});

// ── (2) the body shaper's warnings ─────────────────────────────────────────────────────────────────────

test("(2) an extras key the OpenRouter transport cannot take is named on the item's log, not dropped silently", async () => {
  const lines: LogLine[] = [];
  const executor = executorWith({ fetch: openAiServer([], () => ({})), lines });
  await executor.summarize({
    connection: openRouterConnection("summarize", "anthropic/claude-sonnet-5", { top_secret_knob: 1 }),
    inputs: [ITEM],
    effort: "none",
    maxTokens: 128,
  });
  expect(warnedCodes(lines)).toContain("custom_parameters_ignored");
});

// ── (3) pre-commit retry and the idle ceiling ──────────────────────────────────────────────────────────

test("(3) a 429 on one item is retried before anything streamed, and the batch completes", async () => {
  const recorded: RecordedRequest[] = [];
  let calls = 0;
  const executor = executorWith({
    fetch: openAiServer(recorded, () => {
      calls += 1;
      return calls === 1 ? { status: 429, error: "rate limited" } : { content: "a summary" };
    }),
  });
  const connection = fakeResolved({ task: "summarize", providerId: "vllm", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL });
  const result = await executor.summarize({ connection, inputs: [ITEM] });
  expect(result.items.map((item) => item.text)).toEqual(["a summary"]);
  expect(recorded).toHaveLength(2);
});

/** A server that accepts the request and then sends nothing, until the request is aborted. */
const stalledServer: typeof fetch = (input, init) => {
  if (String(input).endsWith(SLEEP_PROBE_SUFFIX)) {
    return Promise.resolve(Response.json({ is_sleeping: false }));
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
    },
  });
  return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
};

test("(3) a stalled body aborts at the row's requestTimeoutMs on summarize and on a chat turn alike", { timeout: 5000 }, async () => {
  const executor = executorWith({ fetch: stalledServer });
  const declaredFeatures = { requestTimeoutMs: 50 };
  const connection = fakeResolved({ task: "summarize", providerId: "vllm", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL, declaredFeatures });
  await expect(executor.summarize({ connection, inputs: [ITEM] })).rejects.toMatchObject({ name: "ProviderError" });
  const chat = fakeResolved({ task: "chat", providerId: "vllm", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL, declaredFeatures });
  await expect(
    executor.runChatTurn({
      api: "chat-completions",
      connection: chat,
      params: {},
      systemPrompt: { static: "S.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Go." }] }],
    }),
  ).rejects.toMatchObject({ name: "ProviderError" });
});

// ── (4) cost ───────────────────────────────────────────────────────────────────────────────────────────

test("(4) a row with shipped pricing reports the item's estimated cost", async () => {
  const executor = executorWith({ fetch: openAiServer([], () => ({ usage: { prompt: 1000, completion: 500 } })) });
  const connection = fakeResolved({
    task: "summarize",
    providerId: "vllm",
    model: "m",
    capability: NO_REASONING,
    baseUrl: LOCAL_URL,
    declaredFeatures: { pricing: { inputPerMTok: 3, outputPerMTok: 15 } },
  });
  const result = await executor.summarize({ connection, inputs: [ITEM] });
  expect(result.items[0]?.usage.costUsd).toBeCloseTo((1000 * 3 + 500 * 15) / 1_000_000, 12);
});

// ── (5) the output-cap clamp ───────────────────────────────────────────────────────────────────────────

test("(5) a role cap above the model's own output cap is clamped to it", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: openAiServer(recorded, () => ({})) });
  const capability = generationCapability({
    reasoning: { mode: "none", enabled: false },
    output: { maxTokens: { min: 1, max: 1000 }, structured: true, modalities: ["text"] },
  });
  const connection = fakeResolved({ task: "summarize", providerId: "vllm", model: "m", capability, baseUrl: LOCAL_URL });
  await executor.summarize({ connection, inputs: [ITEM], maxTokens: 5000 });
  expect(recorded[0]?.body["max_tokens"]).toBe(1000);
});

// ── (6) Anthropic extras ───────────────────────────────────────────────────────────────────────────────

/** A direct Anthropic server: a streamed request gets message events, a non-streamed one a message object. */
function anthropicServer(recorded: RecordedRequest[]): typeof fetch {
  return (input, init): Promise<Response> => {
    const body = bodyOf(init);
    recorded.push({ url: String(input), body });
    if (body["stream"] === true) {
      const text = anthropicTextStream("ok")
        .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
        .join("");
      return Promise.resolve(new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } }));
    }
    return Promise.resolve(
      Response.json({
        id: "msg_side",
        type: "message",
        role: "assistant",
        model: "claude",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
    );
  };
}

test("(6) a direct Anthropic summarize carries the connection's inference geography and the owner's metadata digest", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: anthropicServer(recorded) });
  const model = "claude-opus-5";
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" }),
  });
  const connection = fakeResolved({
    task: "summarize",
    providerId: "anthropic",
    model,
    capability,
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-not-a-real-key"),
    extras: { inferenceGeo: "us" },
  });
  await executor.summarize({ connection, inputs: [ITEM], maxTokens: 128 });
  expect(recorded[0]?.body["inference_geo"]).toBe("us");
  expect(recorded[0]?.body["metadata"]).toMatchObject({ user_id: expect.any(String) });
});

// ── (7) agent-sdk: the sampling gate and thinking ──────────────────────────────────────────────────────

const SESSION_ID = "a95fcd1f-a1ca-42db-ac6c-de6b1f01091d";

function agentFrames(model: string, structuredOutput?: unknown): Record<string, unknown>[] {
  return [
    { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "none", model },
    { type: "assistant", session_id: SESSION_ID, message: { content: [{ type: "text", text: "a summary" }], stop_reason: "end_turn" } },
    {
      type: "result",
      subtype: "success",
      session_id: SESSION_ID,
      is_error: false,
      num_turns: 1,
      duration_api_ms: 5,
      terminal_reason: "completed",
      stop_reason: "end_turn",
      errors: [],
      permission_denials: [],
      total_cost_usd: 0,
      usage: { input_tokens: 5, output_tokens: 3 },
      modelUsage: {},
      ...(structuredOutput === undefined ? {} : { structured_output: structuredOutput }),
    },
  ];
}

function recordingQuery(frames: readonly Record<string, unknown>[], options: Record<string, unknown>[]): unknown {
  return (args: { readonly options: Record<string, unknown> }): AsyncGenerator<Record<string, unknown>> => {
    options.push(args.options);
    return (async function* stream(): AsyncGenerator<Record<string, unknown>> {
      for (const frame of frames) {
        await Promise.resolve();
        yield frame;
      }
    })();
  };
}

function agentConnection<T extends "summarize" | "structured">(task: T, model: string): ReturnType<typeof fakeResolved<T>> {
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("claude-sub"), wire: "agent-sdk", api: "agent-sdk" }),
  });
  return fakeResolved({ task, providerId: "claude-sub", model, capability, secret: fakeApiKeySecret("sk-ant-oat-not-a-real-token") });
}

test("(7) agent-sdk summarize runs a preset's effort with thinking on, and drops a role temperature by name", async () => {
  const options: Record<string, unknown>[] = [];
  const lines: LogLine[] = [];
  const model = "claude-opus-5";
  const executor = executorWith({ agentSdkQuery: recordingQuery(agentFrames(model), options), lines });
  const result = await executor.summarize({ connection: agentConnection("summarize", model), inputs: [ITEM], effort: "high", temperature: 0.5 });
  expect(result.items.map((item) => item.text)).toEqual(["a summary"]);
  expect(options[0]?.["thinking"]).toMatchObject({ type: "adaptive" });
  expect(options[0]?.["effort"]).toBe("high");
  expect((options[0]?.["env"] as Record<string, unknown>)["CLAUDE_CODE_DISABLE_THINKING"]).toBeUndefined();
  expect(warnedCodes(lines)).toContain("sampling_knob_dropped");
});

test("(7) agent-sdk structured still refuses a turn that produced no structured_output frame", async () => {
  const model = "claude-opus-5";
  const executor = executorWith({ agentSdkQuery: recordingQuery(agentFrames(model), []) });
  const format: ResponseFormat = {
    name: "row",
    schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }),
  };
  await expect(executor.structured({ connection: agentConnection("structured", model), inputs: [ITEM], responseFormat: format })).rejects.toMatchObject({
    kind: "invalid",
  });
});

// ── (8) word-keyed logit bias ──────────────────────────────────────────────────────────────────────────

test("(8) a word-keyed logit bias resolves to token ids through the server's tokenizer", async () => {
  const chats: RecordedRequest[] = [];
  const chat = openAiServer(chats, () => ({}));
  const server: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.endsWith("/tokenize")) {
      const word = String(bodyOf(init)["prompt"] ?? "");
      const ids = [...word].map((char) => char.codePointAt(0) ?? 0);
      return Promise.resolve(Response.json({ count: ids.length, max_model_len: 4096, tokens: ids, token_strs: [...word] }));
    }
    return chat(input, init);
  };
  const executor = executorWith({ fetch: server });
  const connection = fakeResolved({
    task: "summarize",
    providerId: "vllm",
    model: "local-model",
    capability: localCapability("vllm", "local-model"),
    baseUrl: LOCAL_URL,
  });
  await executor.summarize({ connection, inputs: [ITEM], logitBias: { Ela: -100 } });
  expect(chats[0]?.body["logit_bias"]).toEqual({ "69": -100, "108": -100, "97": -100 });
});

// ── (9) error classification ───────────────────────────────────────────────────────────────────────────

test("(9) a chat template's role refusal on summarize reads as the chat turn's fix, and is not retried", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: openAiServer(recorded, () => ({ status: 500, error: "System message must be at the beginning." })) });
  const connection = fakeResolved({
    task: "summarize",
    providerId: "llama-cpp",
    model: "local-model",
    capability: localCapability("llama-cpp", "local-model"),
    baseUrl: LOCAL_URL,
  });
  const failure = await executor.summarize({ connection, inputs: [ITEM] }).catch((err: unknown) => err);
  expect(failure).toMatchObject({ kind: "invalid", retryable: false });
  expect(String((failure as Error).message)).toContain("Message handling");
  expect(recorded).toHaveLength(1);
});

// ── (10) inline reasoning, cache markers ───────────────────────────────────────────────────────────────

test("(10) an unterminated <think> block at the output cap never reaches the summary text", async () => {
  const executor = executorWith({ fetch: openAiServer([], () => ({ content: "<think>weighing which beats matter and never closing", finish: "length" })) });
  const connection = fakeResolved({ task: "summarize", providerId: "custom-openai", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL });
  const result = await executor.summarize({ connection, inputs: [ITEM], maxTokens: 64 });
  expect(result.items[0]?.text).not.toContain("<think>");
});

test("(10) items sharing a static system prompt on an OpenRouter Claude route each place its cache breakpoint", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: openAiServer(recorded, () => ({})) });
  const shared = "You are a careful summarizer. ".repeat(40);
  await executor.summarize({
    connection: openRouterConnection("summarize", "anthropic/claude-sonnet-5"),
    inputs: [
      { systemPrompt: shared, userPrompt: "One." },
      { systemPrompt: shared, userPrompt: "Two." },
    ],
    effort: "none",
    maxTokens: 128,
  });
  expect(recorded).toHaveLength(2);
  for (const request of recorded) {
    expect(JSON.stringify((request.body["messages"] as unknown[])[0])).toContain("cache_control");
  }
});

// ── (11) the role preset's window on Ollama's native route (0565) ──────────────────────────────────────

/** Ollama's `/api/chat`: a streamed request gets NDJSON lines, a non-streamed one the single answer. */
function ollamaServer(recorded: RecordedRequest[]): typeof fetch {
  return (input, init): Promise<Response> => {
    const body = bodyOf(init);
    recorded.push({ url: String(input), body });
    const done = { model: "m", message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 10, eval_count: 3 };
    if (body["stream"] === true) {
      const lines = [{ model: "m", message: { role: "assistant", content: "a summary" }, done: false }, done].map((line) => JSON.stringify(line)).join("\n");
      return Promise.resolve(new Response(`${lines}\n`, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    }
    return Promise.resolve(Response.json({ ...done, message: { role: "assistant", content: "a summary" } }));
  };
}

test("(11) a Utility preset's Max context 16384 on an unpinned Ollama native row sends num_ctx 16384", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: ollamaServer(recorded) });
  const capability = generationCapability({ reasoning: { mode: "none", enabled: false }, context: { window: 4096, settable: { max: 32_768 } } });
  const connection = fakeResolved({ task: "summarize", providerId: "ollama", model: "qwen2.5:0.5b", capability, baseUrl: OLLAMA_URL });
  await executor.summarize({ connection, inputs: [ITEM], maxContextTokens: 16_384 });
  expect(recorded[0]?.body["options"]).toMatchObject({ num_ctx: 16_384 });
});

// ── 0525: the mandatory-reasoning replay re-sends only the refused item ────────────────────────────────

test("0525: an item refused as mandatory-reasoning replays alone; an item that already succeeded is never re-sent", async () => {
  const recorded: RecordedRequest[] = [];
  const mandatory = "Reasoning is mandatory for this endpoint and cannot be disabled.";
  const executor = executorWith({
    fetch: openAiServer(recorded, (body) => {
      const reasoning = body["reasoning"] as { readonly effort?: string } | undefined;
      return userTextOf(body).includes("Second item.") && reasoning?.effort === "none" ? { status: 400, error: mandatory } : { content: "done" };
    }),
  });
  const result = await executor.summarize({
    connection: openRouterConnection("summarize", "anthropic/claude-sonnet-5"),
    inputs: [
      { systemPrompt: "Summarize.", userPrompt: "First item." },
      { systemPrompt: "Summarize.", userPrompt: "Second item." },
    ],
    effort: "none",
    maxTokens: 128,
  });
  expect(result.items.map((item) => item.text)).toEqual(["done", "done"]);
  expect(recorded.filter((request) => userTextOf(request.body).includes("First item."))).toHaveLength(1);
});

// ── one speller: the template switch is the off on a row that spells one ───────────────────────────────

test("a vLLM side-generation off is the template switch alone: enable_thinking false, never reasoning_effort none beside it", async () => {
  const recorded: RecordedRequest[] = [];
  const executor = executorWith({ fetch: openAiServer(recorded, () => ({})) });
  const capability = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });
  const connection = fakeResolved({ task: "summarize", providerId: "vllm", model: "m", capability, baseUrl: LOCAL_URL });
  await executor.summarize({ connection, inputs: [ITEM], effort: "none" });
  const body = recorded[0]?.body ?? {};
  expect(body["chat_template_kwargs"]).toMatchObject({ enable_thinking: false });
  expect(body).not.toHaveProperty("reasoning_effort");
});
