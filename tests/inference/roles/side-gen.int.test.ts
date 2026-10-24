// @subject packages/inference/src/roles/side-gen.ts
// @subject packages/inference/src/roles/executor.ts
import type { Capability } from "@orb/contracts/inference";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ProviderExecutor, Resolved } from "@orb/inference";
import { ProviderError } from "@orb/inference";
import { isPlainObject } from "@orb/kit/guards";
import type { JsonValue } from "@orb/kit/json";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { createManualTimer } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { processObservability } from "@orb/testkit/node/composed";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { openAiServer, recordRequest, SLEEP_PROBE_SUFFIX } from "@orb/testkit/node/helpers";
import { vi } from "vitest";
import { z } from "zod";
import { physicalSdkScenario } from "../backends/agent-sdk/regression-edge.fixtures.ts";
import { createRuntimeRoot, generationCapability, observeRuntimeTimers, runtimeTimers, wireConnection } from "./runtime.fixtures.ts";

const LOCAL_URL = "http://box.local:8080/v1";

const OLLAMA_URL = "http://127.0.0.1:11434/v1";

const NO_REASONING: Capability = generationCapability({ reasoning: { mode: "none", enabled: false } });

function warnedCodes(lines: readonly (readonly unknown[])[]): readonly unknown[] {
  return lines.flatMap(([fields]) => (isPlainObject(fields) && fields["event"] === "provider.resolve-warning" ? [fields["code"]] : []));
}

function userTextOf(body: Record<string, unknown>): string {
  return JSON.stringify(body["messages"] ?? []);
}

const ITEM = { systemPrompt: "Summarize.", userPrompt: "A long scene." } as const;

function openRouterConnection<T extends "summarize" | "structured">(
  root: ServerTestHarness,
  task: T,
  model: string,
  extras?: Readonly<Record<string, JsonValue>>,
): Promise<Resolved<T>> {
  return wireConnection(root, { task, providerId: "openrouter", model, ...(extras === undefined ? {} : { extras }) });
}

function agentConnection<T extends "summarize" | "structured">(root: ServerTestHarness, task: T, model: string): Promise<Resolved<T>> {
  return wireConnection(root, { task, providerId: "claude-sub", model });
}

test("(1) an OpenRouter summarize carries the connection's provider routing, data-collection preference, fallback models and plugins", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({})) });
  const executor = root.app.runtime.executor;
  const extras = { provider: { ["data_collection"]: "deny", only: ["Anthropic"] }, models: ["anthropic/claude-sonnet-5", "openai/gpt-5.1"] };
  await executor.summarize({
    connection: await openRouterConnection(root, "summarize", "anthropic/claude-sonnet-5", extras),
    inputs: [ITEM],
    effort: "none",
    maxTokens: 128,
  });
  const body = recorded[0]?.body ?? {};
  expect(body["provider"]).toEqual({ ["data_collection"]: "deny", only: ["Anthropic"] });
  expect(body["models"]).toEqual(["anthropic/claude-sonnet-5", "openai/gpt-5.1"]);
  expect(body["plugins"]).toEqual([{ id: "context-compression", enabled: false }]);
});

test("(1) an OpenRouter Claude summarize with no routing of its own is pinned to Anthropic, as a chat turn is", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({})) });
  const executor = root.app.runtime.executor;
  await executor.summarize({
    connection: await openRouterConnection(root, "summarize", "anthropic/claude-sonnet-5"),
    inputs: [ITEM],
    effort: "none",
    maxTokens: 128,
  });
  expect(recorded[0]?.body["provider"]).toMatchObject({ ["allow_fallbacks"]: false });
});

test("(2) an extras key the OpenRouter transport cannot take is named on the item's log, not dropped silently", async () => {
  await using root = await createRuntimeRoot({ providerFetch: openAiServer([], () => ({})) });
  using warning = vi.spyOn(processObservability.logger(), "warn");
  const executor = root.app.runtime.executor;
  await executor.summarize({
    connection: await openRouterConnection(root, "summarize", "anthropic/claude-sonnet-5", { ["top_secret_knob"]: 1 }),
    inputs: [ITEM],
    effort: "none",
    maxTokens: 128,
  });
  expect(warnedCodes(warning.mock.calls)).toContain("custom_parameters_ignored");
});

test("(3) a 429 on one item is retried before anything streamed, and the batch completes", async () => {
  const recorded: RecordedRequest[] = [];
  let calls = 0;
  const timer = observeRuntimeTimers();
  await using root = await createRuntimeRoot({
    providerFetch: openAiServer(
      recorded,
      () => {
        calls += 1;
        return calls === 1 ? { status: 429, error: "rate limited" } : { content: "a summary" };
      },
      2,
    ),
    timers: timer.timers,
  });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, {
    task: "summarize",
    providerId: "vllm",
    model: "m",
    capability: NO_REASONING,
    baseUrl: LOCAL_URL,
    declaredFeatures: { requestTimeoutMs: 50 },
  });
  const cancel = new AbortController();
  const outcome = executor.summarize({ connection, inputs: [ITEM], signal: cancel.signal }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await using _retryRequest = {
    async [Symbol.asyncDispose](): Promise<void> {
      cancel.abort();
      await outcome;
    },
  };
  const backoff = await Promise.race([
    timer.next((window) => recorded.length === 1 && window.ms !== connection.features.requestTimeoutMs, cancel.signal),
    outcome.then(() => {
      throw new Error("the rate-limited operation settled before requesting its retry window");
    }),
  ]);
  expect(recorded).toHaveLength(1);
  backoff.fire();
  const settled = await outcome;
  if (!settled.ok) {
    throw settled.error;
  }
  const result = settled.value;
  expect(result.items.map((item) => item.text)).toEqual(["a summary"]);
  expect(recorded).toHaveLength(2);
});

function stalledServer(): { readonly fetch: typeof fetch; readonly nextBody: () => Promise<void> } {
  const receipts: PromiseWithResolvers<void>[] = [];
  let received = 0;
  let consumed = 0;
  const receiptAt = (index: number): PromiseWithResolvers<void> => {
    const receipt = receipts[index] ?? Promise.withResolvers<void>();
    receipts[index] = receipt;
    return receipt;
  };
  return {
    nextBody: () => receiptAt(consumed++).promise,
    fetch: (input, init): Promise<Response> => {
      const request = new Request(input, init);
      if (request.url.endsWith(SLEEP_PROBE_SUFFIX)) {
        return Promise.resolve(Response.json({ ["is_sleeping"]: false }));
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller): void {
          request.signal.addEventListener("abort", () => controller.error(request.signal.reason), { once: true });
        },
      });
      receiptAt(received++).resolve();
      return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
    },
  };
}

async function idleFailure<T>(
  call: (signal: AbortSignal) => Promise<T>,
  edge: ReturnType<typeof stalledServer>,
  timer: ReturnType<typeof observeRuntimeTimers>,
): Promise<T> {
  const cleanup = new AbortController();
  const outcome = call(cleanup.signal).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  let awaitingBody = true;
  let firedIdle = false;
  try {
    for (;;) {
      const bodyPhase = awaitingBody;
      const window = await Promise.race([outcome.then(() => undefined), timer.next((requested) => requested.ms === 50 || !bodyPhase, cleanup.signal)]);
      if (window === undefined) {
        break;
      }
      if (window.ms === 50) {
        await edge.nextBody();
        firedIdle = true;
        awaitingBody = false;
      } else {
        awaitingBody = true;
      }
      expect(window.live(), "the accepted body or retry still holds its requested window").toBe(true);
      window.fire();
    }
  } finally {
    cleanup.abort();
    await outcome;
  }
  const result = await outcome;
  expect(firedIdle, "the accepted body reached the declared 50ms idle boundary").toBe(true);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

async function cancelledAtBody<T>(call: (signal: AbortSignal) => Promise<T>, edge: ReturnType<typeof stalledServer>): Promise<T> {
  const cancel = new AbortController();
  const outcome = call(cancel.signal).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  try {
    await edge.nextBody();
  } finally {
    cancel.abort(new Error("network timeout"));
    await outcome;
  }
  const result = await outcome;
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

test("(3) a stalled body trips at the row's requestTimeoutMs as a retryable server failure on summarize and chat alike", { timeout: 10_000 }, async () => {
  const edge = stalledServer();
  const timer = observeRuntimeTimers();
  await using root = await createRuntimeRoot({ providerFetch: edge.fetch, timers: timer.timers });
  const executor = root.app.runtime.executor;
  const declaredFeatures = { requestTimeoutMs: 50 };
  const connection = await wireConnection(root, {
    task: "summarize",
    providerId: "vllm",
    model: "m",
    capability: NO_REASONING,
    baseUrl: LOCAL_URL,
    declaredFeatures,
  });
  const stalled = { name: "ProviderError", kind: "server", retryable: true };
  await expect(idleFailure((signal) => executor.summarize({ connection, inputs: [ITEM], signal }), edge, timer)).rejects.toMatchObject(stalled);
  const chat = await wireConnection(root, { task: "chat", providerId: "vllm", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL, declaredFeatures });
  const turn = (signal?: AbortSignal): ReturnType<ProviderExecutor["runChatTurn"]> =>
    executor.runChatTurn({
      api: "chat-completions",
      connection: chat,
      params: {},
      systemPrompt: { static: "S.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Go." }] }],
      ...(signal !== undefined ? { signal } : {}),
    });
  await expect(idleFailure(turn, edge, timer)).rejects.toMatchObject(stalled);
  await expect(cancelledAtBody(turn, edge)).rejects.toMatchObject({ kind: "aborted", retryable: false });
});

for (const providerId of ["anthropic", "google"] as const) {
  test(`a stalled ${providerId} chat and side generation trip retryably; caller cancellation does not`, { timeout: 10_000 }, async () => {
    const edge = stalledServer();
    const timer = observeRuntimeTimers();
    await using root = await createRuntimeRoot({ providerFetch: edge.fetch, timers: timer.timers });
    const executor = root.app.runtime.executor;
    const connection = await wireConnection(root, {
      task: "chat",
      providerId,
      model: providerId === "google" ? "gemini-2.5-flash" : "claude-sonnet-5",
      capability: NO_REASONING,
      declaredFeatures: { requestTimeoutMs: 50 },
      key: "test-key",
    });
    const api = providerId === "google" ? "google-generative-ai" : "anthropic-messages";
    const turn = (signal?: AbortSignal): ReturnType<ProviderExecutor["runChatTurn"]> =>
      executor.runChatTurn({
        api,
        connection,
        params: {},
        systemPrompt: { static: "S.", dynamic: "" },
        history: [{ role: "user", content: [{ type: "text", text: "Go." }] }],
        ...(signal === undefined ? {} : { signal }),
      });
    await expect(idleFailure(turn, edge, timer)).rejects.toMatchObject({ kind: "server", retryable: true });
    const summarize = await wireConnection(root, {
      task: "summarize",
      providerId,
      model: connection.model,
      capability: NO_REASONING,
      declaredFeatures: { requestTimeoutMs: 50 },
    });
    await expect(idleFailure((signal) => executor.summarize({ connection: summarize, inputs: [ITEM], signal }), edge, timer)).rejects.toMatchObject({
      kind: "server",
      retryable: true,
    });
    await expect(cancelledAtBody(turn, edge)).rejects.toMatchObject({ kind: "aborted", retryable: false });
  });
}

test("a stalled Google embed trips retryably while caller cancellation remains aborted", async () => {
  const edge = stalledServer();
  const timer = observeRuntimeTimers();
  await using root = await createRuntimeRoot({ providerFetch: edge.fetch, timers: timer.timers });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, {
    task: "embed",
    providerId: "google",
    model: "gemini-embedding-001",
    capability: { kind: "embedding", embedding: { dims: 3, maxInputTokens: 2048, mrl: true, input: ["text"], output: ["vector"], instructionAware: false } },
    declaredFeatures: { requestTimeoutMs: 50 },
    key: "test-key",
  });
  const call = (signal: AbortSignal): ReturnType<ProviderExecutor["embed"]> => executor.embed({ connection, input: "Go.", signal });
  await expect(idleFailure(call, edge, timer)).rejects.toMatchObject({ kind: "server", retryable: true });
  await expect(cancelledAtBody(call, edge)).rejects.toMatchObject({ kind: "aborted", retryable: false });
});

test("(4) a row with shipped pricing reports the item's estimated cost", async () => {
  await using root = await createRuntimeRoot({ providerFetch: openAiServer([], () => ({ usage: { prompt: 1000, completion: 500 } })) });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, {
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

test("(5) a role cap above the model's own output cap is clamped to it", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({})) });
  const executor = root.app.runtime.executor;
  const capability = generationCapability({
    reasoning: { mode: "none", enabled: false },
    output: { maxTokens: { min: 1, max: 1000 }, structured: true, modalities: ["text"] },
  });
  const connection = await wireConnection(root, { task: "summarize", providerId: "vllm", model: "m", capability, baseUrl: LOCAL_URL });
  await executor.summarize({ connection, inputs: [ITEM], maxTokens: 5000 });
  expect(recorded[0]?.body["max_tokens"]).toBe(1000);
});

function anthropicServer(recorded: RecordedRequest[]): typeof fetch {
  return async (input, init): Promise<Response> => {
    const captured = await recordRequest(input, init);
    const { body } = captured;
    recorded.push(captured);
    if (body["stream"] === true) {
      const text = [
        {
          event: "message_start",
          data: {
            type: "message_start",
            message: {
              id: "msg_side",
              type: "message",
              role: "assistant",
              model: "claude",
              content: [],
              ["stop_reason"]: null,
              usage: { ["input_tokens"]: 5, ["output_tokens"]: 1 },
            },
          },
        },
        { event: "content_block_start", data: { type: "content_block_start", index: 0, ["content_block"]: { type: "text", text: "" } } },
        { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } } },
        { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
        { event: "message_delta", data: { type: "message_delta", delta: { ["stop_reason"]: "end_turn" }, usage: { ["output_tokens"]: 3 } } },
        { event: "message_stop", data: { type: "message_stop" } },
      ]
        .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
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
        ["stop_reason"]: "end_turn",
        ["stop_sequence"]: null,
        usage: { ["input_tokens"]: 5, ["output_tokens"]: 3 },
      }),
    );
  };
}

test("(6) a direct Anthropic summarize carries the connection's inference geography and the owner's metadata digest", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: anthropicServer(recorded) });
  const executor = root.app.runtime.executor;
  const model = "claude-opus-5";
  const connection = await wireConnection(root, {
    task: "summarize",
    providerId: "anthropic",
    model,
    baseUrl: null,
    key: "sk-ant-not-a-real-key",
    extras: { inferenceGeo: "us" },
  });
  await executor.summarize({ connection, inputs: [ITEM], maxTokens: 128 });
  expect(recorded[0]?.body["inference_geo"]).toBe("us");
  expect(recorded[0]?.body["metadata"]).toMatchObject({ ["user_id"]: expect.any(String) });
});

const SESSION_ID = "a95fcd1f-a1ca-42db-ac6c-de6b1f01091d";

function agentFrames(model: string, structuredOutput?: unknown): Record<string, unknown>[] {
  return [
    { type: "system", subtype: "init", ["session_id"]: SESSION_ID, apiKeySource: "none", model },
    { type: "assistant", ["session_id"]: SESSION_ID, message: { content: [{ type: "text", text: "a summary" }], ["stop_reason"]: "end_turn" } },
    {
      type: "result",
      subtype: "success",
      ["session_id"]: SESSION_ID,
      ["is_error"]: false,
      ["num_turns"]: 1,
      ["duration_api_ms"]: 5,
      ["terminal_reason"]: "completed",
      ["stop_reason"]: "end_turn",
      errors: [],
      ["permission_denials"]: [],
      ["total_cost_usd"]: 0,
      usage: { ["input_tokens"]: 5, ["output_tokens"]: 3 },
      modelUsage: {},
      ...(structuredOutput === undefined ? {} : { ["structured_output"]: structuredOutput }),
    },
  ];
}

test("(7) agent-sdk summarize runs a preset's effort with thinking on, and drops a role temperature by name", async () => {
  await using edge = physicalSdkScenario({ frames: agentFrames("claude-opus-5") });
  const model = "claude-opus-5";
  await using root = await createRuntimeRoot({ sdkSpawn: edge.spawn });
  using warning = vi.spyOn(processObservability.logger(), "warn");
  const executor = root.app.runtime.executor;
  const result = await executor.summarize({ connection: await agentConnection(root, "summarize", model), inputs: [ITEM], effort: "high", temperature: 0.5 });
  expect(result.items.map((item) => item.text)).toEqual(["a summary"]);
  expect(edge.args[0]).toContain("--thinking=adaptive");
  expect(edge.args[0]).toContain("--effort=high");
  expect(edge.environments[0]?.["CLAUDE_CODE_DISABLE_THINKING"]).toBeUndefined();
  expect(warnedCodes(warning.mock.calls)).toContain("sampling_knob_dropped");
});

test("(7) agent-sdk structured still refuses a turn that produced no structured_output frame", async () => {
  const model = "claude-opus-5";
  await using root = await createRuntimeRoot({ sdkSpawn: physicalSdkScenario({ frames: agentFrames(model) }).spawn });
  const executor = root.app.runtime.executor;
  const format: ResponseFormat = {
    name: "row",
    schema: projectJsonSchema(z.object({ ok: z.boolean() })),
  };
  await expect(
    executor.structured({ connection: await agentConnection(root, "structured", model), inputs: [ITEM], responseFormat: format }),
  ).rejects.toMatchObject({
    kind: "invalid",
  });
});

test("(3) a wedged agent-sdk item with no caller signal is aborted at the row's idle ceiling and fails retryably", async () => {
  const model = "claude-opus-5";
  await using edge = physicalSdkScenario({ frames: agentFrames(model).slice(0, 1), hang: true });
  const timer = createManualTimer();
  await using root = await createRuntimeRoot({ sdkSpawn: edge.spawn, timers: runtimeTimers(timer.schedule) });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, {
    task: "summarize",
    providerId: "claude-sub",
    model,
    key: "sk-ant-oat-not-a-real-token",
    declaredFeatures: { requestTimeoutMs: 50 },
  });
  const outcome = executor.summarize({ connection, inputs: [ITEM] }).catch((error: unknown) => error);
  // A failed setup assertion must still cancel the real Query and await its operation's settlement.
  await using _idleQuery = {
    async [Symbol.asyncDispose](): Promise<void> {
      try {
        await root.app.runtime.agentSdk.settle();
      } finally {
        await outcome;
      }
    },
  };
  await edge.initialized;
  expect(timer.armed()).toContain(50);
  timer.fire();
  expect(await outcome).toMatchObject({ kind: "server", retryable: true });
  expect(edge.children).toHaveLength(1);
  expect(edge.children[0]?.exitCode !== null || edge.children[0].signalCode !== null).toBe(true);
  // The caller's own cancel inside the same window stays a non-retryable abort.
  const cancel = new AbortController();
  await using cancellationEdge = physicalSdkScenario({ frames: agentFrames(model).slice(0, 1), hang: true });
  const callerTimer = createManualTimer();
  await using callerRoot = await createRuntimeRoot({ sdkSpawn: cancellationEdge.spawn, timers: runtimeTimers(callerTimer.schedule) });
  const caller = callerRoot.app.runtime.executor;
  const callerConnection = await wireConnection(callerRoot, { task: "summarize", providerId: "claude-sub", model, declaredFeatures: { requestTimeoutMs: 50 } });
  const cancelled = caller.summarize({ connection: callerConnection, inputs: [ITEM], signal: cancel.signal }).catch((error: unknown) => error);
  await using _callerQuery = {
    async [Symbol.asyncDispose](): Promise<void> {
      try {
        await callerRoot.app.runtime.agentSdk.settle();
      } finally {
        await cancelled;
      }
    },
  };
  await cancellationEdge.initialized;
  expect(callerTimer.armed()).toContain(50);
  cancel.abort(new Error("network timeout"));
  expect(await cancelled).toMatchObject({ kind: "aborted", retryable: false });
  expect(callerTimer.armed()).toEqual([]);
  expect(cancellationEdge.children).toHaveLength(1);
  expect(cancellationEdge.children[0]?.exitCode !== null || cancellationEdge.children[0].signalCode !== null).toBe(true);
});

test("(3) agent-sdk side generation fans out to the connection's utility calls at once, 4 when it states none", async () => {
  const model = "claude-opus-5";
  const run = async (declaredFeatures: { readonly concurrency?: { readonly summarize: number } }): Promise<number> => {
    await using edge = physicalSdkScenario({ frames: agentFrames(model), delayMs: 20 });
    await using root = await createRuntimeRoot({ sdkSpawn: edge.spawn });
    const executor = root.app.runtime.executor;
    const connection = await wireConnection(root, {
      task: "summarize",
      providerId: "claude-sub",
      model,
      key: "sk-ant-oat-not-a-real-token",
      declaredFeatures,
    });
    await executor.summarize({ connection, inputs: Array.from({ length: 10 }, () => ITEM) });
    return edge.peak();
  };
  expect(await run({})).toBe(4);
  expect(await run({ concurrency: { summarize: 2 } })).toBe(2);
});

test("(8) a word-keyed logit bias resolves to token ids through the server's tokenizer", async () => {
  const chats: RecordedRequest[] = [];
  const chat = openAiServer(chats, () => ({}));
  const server: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith("/tokenize")) {
      const word = z.string().parse((await recordRequest(request)).body["prompt"]);
      const ids = [...word].map((char) => char.codePointAt(0) ?? 0);
      return Promise.resolve(Response.json({ count: ids.length, ["max_model_len"]: 4096, tokens: ids, ["token_strs"]: [...word] }));
    }
    return chat(request);
  };
  await using root = await createRuntimeRoot({ providerFetch: server });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, {
    task: "summarize",
    providerId: "vllm",
    model: "local-model",
    baseUrl: LOCAL_URL,
  });
  await executor.summarize({ connection, inputs: [ITEM], logitBias: { ["Ela"]: -100 } });
  expect(chats[0]?.body["logit_bias"]).toEqual({ "69": -100, "108": -100, "97": -100 });
});

test("(9) a chat template's role refusal on summarize reads as the chat turn's fix, and is not retried", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({
    providerFetch: openAiServer(recorded, () => ({ status: 500, error: "System message must be at the beginning." })),
  });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, {
    task: "summarize",
    providerId: "llama-cpp",
    model: "local-model",
    baseUrl: LOCAL_URL,
  });
  const failure = await executor.summarize({ connection, inputs: [ITEM] }).catch((err: unknown) => err);
  expect(failure).toMatchObject({ kind: "invalid", retryable: false });
  expect(failure instanceof Error ? failure.message : failure).toContain("Message handling");
  expect(recorded).toHaveLength(1);
});

test("(10) an unterminated <think> block at the output cap never reaches the summary text", async () => {
  await using root = await createRuntimeRoot({
    providerFetch: openAiServer([], () => ({ content: "<think>weighing which beats matter and never closing", finish: "length" })),
  });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, { task: "summarize", providerId: "custom-openai", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL });
  const result = await executor.summarize({ connection, inputs: [ITEM], maxTokens: 64 });
  expect(result.items[0]?.text).not.toContain("<think>");
});

test("(10) the Utility preset's own tag pair splits a summarize reply in place of the house pair", async () => {
  await using root = await createRuntimeRoot({
    providerFetch: openAiServer([], () => ({ content: "<reason>which beats matter</reason>The scene, summarized." })),
  });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, { task: "summarize", providerId: "custom-openai", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL });
  const result = await executor.summarize({ connection, inputs: [ITEM], reasoningTags: { prefix: "<reason>", suffix: "</reason>" } });
  expect(result.items[0]?.text).toBe("The scene, summarized.");
});

test("(10) a role tag pair wrapped in whitespace splits on its trimmed form, ST's default pair included", async () => {
  for (const [tag, pair] of [
    ["think", { prefix: "<think>\n", suffix: "\n</think>" }],
    ["reason", { prefix: "<reason>\n", suffix: "\n</reason>" }],
  ] as const) {
    await using root = await createRuntimeRoot({
      providerFetch: openAiServer([], () => ({ content: `<${tag}>which beats matter</${tag}>The scene, summarized.` })),
    });
    const executor = root.app.runtime.executor;
    const connection = await wireConnection(root, { task: "summarize", providerId: "custom-openai", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL });
    const result = await executor.summarize({ connection, inputs: [ITEM], reasoningTags: pair });
    expect(result.items[0]?.text, tag).toBe("The scene, summarized.");
  }
});

test("(10) a role tag pair the splitter cannot carry falls back to the house pair", async () => {
  await using root = await createRuntimeRoot({
    providerFetch: openAiServer([], () => ({ content: "<think>which beats matter</think>The scene, summarized." })),
  });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, { task: "summarize", providerId: "custom-openai", model: "m", capability: NO_REASONING, baseUrl: LOCAL_URL });
  const result = await executor.summarize({ connection, inputs: [ITEM], reasoningTags: { prefix: "[thinking]", suffix: "[/thinking]" } });
  expect(result.items[0]?.text).toBe("The scene, summarized.");
});

test("(10) items sharing a static system prompt on an OpenRouter Claude route each place its cache breakpoint", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({}), 2) });
  const executor = root.app.runtime.executor;
  const shared = "You are a careful summarizer. ".repeat(40);
  await executor.summarize({
    connection: await openRouterConnection(root, "summarize", "anthropic/claude-sonnet-5"),
    inputs: [
      { systemPrompt: shared, userPrompt: "One." },
      { systemPrompt: shared, userPrompt: "Two." },
    ],
    effort: "none",
    maxTokens: 128,
  });
  expect(recorded).toHaveLength(2);
  for (const request of recorded) {
    const messages = request.body["messages"];
    if (!Array.isArray(messages)) {
      throw new Error("the physical cache request carried no messages array");
    }
    expect(JSON.stringify(messages[0])).toContain("cache_control");
  }
});

function ollamaServer(recorded: RecordedRequest[]): typeof fetch {
  const reads = new Map<string, JsonValue>([
    ["/v1/models", { data: [{ id: "qwen2.5:0.5b" }] }],
    ["/api/version", { version: "0.15.5" }],
    ["/api/ps", { models: [] }],
    ["/api/show", { parameters: "", capabilities: ["completion"], ["model_info"]: { "general.architecture": "qwen2", "qwen2.context_length": 32_768 } }],
  ]);
  let render = true;
  let reply = true;
  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const read = reads.get(path);
    if (read !== undefined) {
      reads.delete(path);
      return Response.json(read);
    }
    if (path !== "/api/chat") {
      throw new Error(`the physical Ollama script has no reply for ${path}`);
    }
    const captured = await recordRequest(request);
    const { body } = captured;
    if (body["_debug_render_only"] === true && render) {
      render = false;
      return Response.json({ ["_debug_info"]: { ["rendered_template"]: "a closed prompt" } });
    }
    if (!reply || body["_debug_render_only"] === true) {
      throw new Error("the physical Ollama generation or render recipe was exhausted");
    }
    reply = false;
    recorded.push(captured);
    const done = { model: "m", message: { role: "assistant", content: "" }, done: true, ["done_reason"]: "stop", ["prompt_eval_count"]: 10, ["eval_count"]: 3 };
    if (body["stream"] === true) {
      const lines = [{ model: "m", message: { role: "assistant", content: "a summary" }, done: false }, done].map((line) => JSON.stringify(line)).join("\n");
      return Promise.resolve(new Response(`${lines}\n`, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    }
    return Promise.resolve(Response.json({ ...done, message: { role: "assistant", content: "a summary" } }));
  };
}

test("(11) a Utility preset's Max context 16384 on an unpinned Ollama native row sends num_ctx 16384", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: ollamaServer(recorded) });
  const executor = root.app.runtime.executor;
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "ollama",
    model: "qwen2.5:0.5b",
    baseUrl: OLLAMA_URL,
    credentialId: null,
    allowBackground: true,
    declared: { kind: "generation", generation: { reasoning: { mode: "none", enabled: false }, context: { window: 4096 } } },
  });
  const { resolved } = await root.app.runtime.resolve({ principal, task: "summarize", connectionId: row.id });
  const connection = { ...resolved, task: "summarize" as const };
  expect(connection.capability).toMatchObject({ kind: "generation", generation: { context: { window: 4096, settable: { max: 32_768 } } } });
  await executor.summarize({ connection, inputs: [ITEM], maxContextTokens: 16_384 });
  expect(recorded[0]?.body["options"]).toMatchObject({ ["num_ctx"]: 16_384 });
});

test("0525: an item refused as mandatory-reasoning replays alone; an item that already succeeded is never re-sent", async () => {
  const recorded: RecordedRequest[] = [];
  const mandatory = "Reasoning is mandatory for this endpoint and cannot be disabled.";
  await using root = await createRuntimeRoot({
    providerFetch: openAiServer(
      recorded,
      (body) => {
        const reasoning = body["reasoning"];
        return userTextOf(body).includes("Second item.") && isPlainObject(reasoning) && reasoning["effort"] === "none"
          ? { status: 400, error: mandatory }
          : { content: "done" };
      },
      3,
    ),
  });
  const executor = root.app.runtime.executor;
  const result = await executor.summarize({
    connection: await openRouterConnection(root, "summarize", "anthropic/claude-sonnet-5"),
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

test("a failed batch carries the items it finished, by input index, so a caller re-sends only the rest", async () => {
  await using root = await createRuntimeRoot({
    providerFetch: openAiServer([], (body) => (userTextOf(body).includes("Second item.") ? { status: 400, error: "bad item" } : { content: "done" }), 2),
  });
  const executor = root.app.runtime.executor;
  const connection = await wireConnection(root, {
    task: "summarize",
    providerId: "vllm",
    model: "m",
    capability: NO_REASONING,
    baseUrl: LOCAL_URL,
    declaredFeatures: { concurrency: { summarize: 1 } },
  });
  const inputs = ["First item.", "Second item.", "Third item."].map((userPrompt) => ({ systemPrompt: "Summarize.", userPrompt }));
  const failure = await executor.summarize({ connection, inputs }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ProviderError);
  if (!(failure instanceof ProviderError)) {
    throw failure;
  }
  expect(failure.partialItems?.map((item) => item?.text)).toEqual(["done", undefined, undefined]);
});

test("a vLLM side-generation off is the template switch alone: enable_thinking false, never reasoning_effort none beside it", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({})) });
  const executor = root.app.runtime.executor;
  const capability = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });
  const connection = await wireConnection(root, { task: "summarize", providerId: "vllm", model: "m", capability, baseUrl: LOCAL_URL });
  await executor.summarize({ connection, inputs: [ITEM], effort: "none" });
  const body = recorded[0]?.body ?? {};
  expect(body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false });
  expect(body).not.toHaveProperty("reasoning_effort");
});
