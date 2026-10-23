// Real owned resolution and execution; only raw provider protocols vary by wire.
import type { ChatDeltaEvent } from "@orb/contracts/chat";
import { wireCapturesResponseSchema } from "@orb/contracts/debug";
import type { Capability, GenerationCapability, Task, Wire } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, EMBEDDING_FLOOR, WIRE_DEFS, WIRES } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type {
  AgentSdkChatRequest,
  AnthropicChatRequest,
  ChatEvent,
  ChatRequest,
  EmbedRequest,
  OpenAiCompatChatRequest,
  ProviderExecutor,
  StructuredRequest,
  WireTool,
} from "@orb/inference";
import { ProviderError } from "@orb/inference";
import type { ChatId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createSeededIds, DEFAULT_EMBED_MODEL } from "@orb/testkit/iso";
import { test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { seedRecallRoom } from "@orb/testkit/node/composed";
import { z } from "zod";
import { physicalSdkScenario } from "../backends/agent-sdk/regression-edge.fixtures.ts";
import { createRuntimeRoot, generationCapability, wireConnection } from "../roles/runtime.fixtures.ts";
import type { SseEvent } from "./transport.fixtures.ts";
import { eventResponse, scriptedResponses } from "./transport.fixtures.ts";

const SESSION_ID = "a95fcd1f-a1ca-42db-ac6c-de6b1f01091d";

const CONTEXT_WINDOW = 200_000;

const MAX_OUTPUT_TOKENS = 8192;

const PRICING = { inputPerMTok: 3, outputPerMTok: 15 };

const EMBED_DIMS = 1024;

const ids = createSeededIds();

export const CONFORMANCE_TASKS = ["chat", "structured", "embed"] as const satisfies readonly Task[];

type ConformanceTask = (typeof CONFORMANCE_TASKS)[number];

const SKIP_REASONS = ["unserved", "no-driver"] as const;

type SkipReason = (typeof SKIP_REASONS)[number];

export const CONFORMANCE_WIRES = WIRES;

function providerForWire(wire: Wire): string {
  const row = BUILTIN_PROVIDERS.find((provider) => provider.wire === wire);
  if (row === undefined) {
    throw new Error(`conformance: no built-in provider row for the "${wire}" wire`);
  }
  return row.id;
}

export function meteredForWire(wire: Wire): boolean {
  const row = BUILTIN_PROVIDERS.find((provider) => provider.wire === wire);
  return row?.metered === true;
}

function servesConformanceTask(wire: Wire, task: ConformanceTask): boolean {
  return WIRE_DEFS[wire].serves.includes(task);
}

export interface ChatScript {
  readonly deltas: readonly string[];
  /** The wire's RAW stop word on the terminal frame, or `null` to OMIT the terminal frame entirely — the
   *  #1400 TRUNCATION control: a stream that simply ends must fail closed, never commit an empty reply. */
  readonly stop: string | null;
  /** The WHOLE prompt: uncached input plus the cache read and write below. Each rendering spells it in the
   *  wire's own grammar (Anthropic's `input_tokens` is the uncached part only). */
  readonly tokensIn: number;
  readonly tokensOut: number;
  /** A cost figure on the wire's own accounting channel, where it has one. */
  readonly costUsd?: number | undefined;
  /** Prompt tokens served from the cache, a part of `tokensIn`. */
  readonly cacheRead?: number | undefined;
}

function uncachedInput(script: ChatScript): number {
  return script.tokensIn - (script.cacheRead ?? 0);
}

function openAiChunk(choice: Record<string, unknown>, usage?: Record<string, unknown>): SseEvent {
  return {
    event: "",
    data: { id: "gen-conformance", object: "chat.completion.chunk", created: 1, model: "m", choices: [choice], ...(usage !== undefined ? { usage } : {}) },
  };
}

function openAiCompatScript(script: ChatScript): SseEvent[] {
  const out = script.deltas.map((text, index) =>
    openAiChunk({ index: 0, delta: index === 0 ? { role: "assistant", content: text } : { content: text }, ["finish_reason"]: null }),
  );
  if (script.stop === null) {
    return out;
  }
  out.push(
    openAiChunk(
      { index: 0, delta: {}, ["finish_reason"]: script.stop },
      {
        ["prompt_tokens"]: script.tokensIn,
        ["completion_tokens"]: script.tokensOut,
        ["total_tokens"]: script.tokensIn + script.tokensOut,
        ...(script.cacheRead !== undefined ? { ["prompt_tokens_details"]: { ["cached_tokens"]: script.cacheRead } } : {}),
        ...(script.costUsd !== undefined ? { cost: script.costUsd } : {}),
      },
    ),
  );
  return out;
}

function anthropicScript(script: ChatScript): SseEvent[] {
  const out: SseEvent[] = [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_conformance",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
          ["stop_reason"]: null,
          usage: { ["input_tokens"]: uncachedInput(script), ["cache_read_input_tokens"]: script.cacheRead ?? 0, ["output_tokens"]: 1 },
        },
      },
    },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, ["content_block"]: { type: "text", text: "" } } },
    ...script.deltas.map(
      (text): SseEvent => ({ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } }),
    ),
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
  ];
  if (script.stop === null) {
    return out;
  }
  out.push(
    { event: "message_delta", data: { type: "message_delta", delta: { ["stop_reason"]: script.stop }, usage: { ["output_tokens"]: script.tokensOut } } },
    { event: "message_stop", data: { type: "message_stop" } },
  );
  return out;
}

function googleScript(script: ChatScript): SseEvent[] {
  const events: SseEvent[] = script.deltas.map((text) => ({ event: "", data: { candidates: [{ content: { role: "model", parts: [{ text }] } }] } }));
  if (script.stop !== null) {
    events.push({
      event: "",
      data: {
        candidates: [{ content: { role: "model", parts: [] }, finishReason: script.stop === "stop" ? "STOP" : script.stop }],
        usageMetadata: {
          promptTokenCount: script.tokensIn,
          candidatesTokenCount: script.tokensOut,
          totalTokenCount: script.tokensIn + script.tokensOut,
          cachedContentTokenCount: script.cacheRead ?? 0,
        },
      },
    });
  }
  return events;
}

function hostedScript(wire: Wire, script: ChatScript): SseEvent[] {
  if (wire === "google-generative-ai") {
    return googleScript(script);
  }
  return wire === "anthropic-messages" ? anthropicScript(script) : openAiCompatScript(script);
}

function agentSdkFrames(script: ChatScript, model: string): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [
    { type: "system", subtype: "init", ["session_id"]: SESSION_ID, apiKeySource: "none", model },
    ...script.deltas.map((text) => ({
      type: "stream_event",
      ["session_id"]: SESSION_ID,
      event: { type: "content_block_delta", delta: { type: "text_delta", text } },
    })),
    {
      type: "assistant",
      ["session_id"]: SESSION_ID,
      message: { content: script.deltas.map((text) => ({ type: "text", text })), ["stop_reason"]: script.stop },
    },
  ];
  if (script.stop === null) {
    return frames;
  }
  const costUSD = script.costUsd ?? 0;
  frames.push({
    type: "result",
    subtype: "success",
    ["session_id"]: SESSION_ID,
    ["is_error"]: false,
    ["num_turns"]: 1,
    ["duration_api_ms"]: 5,
    ["ttft_ms"]: 1,
    ["total_cost_usd"]: costUSD,
    ["stop_reason"]: script.stop,
    ["terminal_reason"]: "completed",
    errors: [],
    ["permission_denials"]: [],
    usage: { ["input_tokens"]: uncachedInput(script), ["cache_read_input_tokens"]: script.cacheRead ?? 0, ["output_tokens"]: script.tokensOut },
    modelUsage: {
      [model]: {
        inputTokens: uncachedInput(script),
        outputTokens: script.tokensOut,
        cacheReadInputTokens: script.cacheRead ?? 0,
        cacheCreationInputTokens: 0,
        costUSD,
        webSearchRequests: 0,
        contextWindow: CONTEXT_WINDOW,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    },
  });
  return frames;
}

export function skipReasonFor(wire: Wire, task: ConformanceTask, driver: typeof hasDriver = hasDriver): SkipReason | null {
  if (!servesConformanceTask(wire, task)) {
    return "unserved";
  }
  return driver(wire, task) ? null : "no-driver";
}

export function hasDriver(wire: Wire, task: ConformanceTask): boolean {
  if (task === "chat" || task === "structured") {
    return wire === "openai-compat" || wire === "anthropic-messages" || wire === "google-generative-ai" || wire === "agent-sdk";
  }
  return wire === "local-light" || wire === "openai-compat" || wire === "google-generative-ai";
}

export function chatCapability(overrides: Partial<GenerationCapability> = {}): Capability {
  return generationCapability({
    context: { window: CONTEXT_WINDOW },
    output: { maxTokens: { min: 1, max: MAX_OUTPUT_TOKENS }, structured: true, modalities: ["text"] },
    ...overrides,
  });
}

function modelForWire(wire: Wire): string {
  return wire === "anthropic-messages" ? "claude-opus-4-5-20251101" : "conformance-model-1";
}

export interface ChatArmResult {
  readonly deltas: readonly string[];
  readonly events: readonly ChatEvent[];
  readonly captured: readonly Record<string, unknown>[];
  readonly turn: Awaited<ReturnType<ProviderExecutor["runChatTurn"]>>;
}

export interface ChatArmOptions {
  readonly script: ChatScript;
  readonly signal?: AbortSignal | undefined;
  readonly params?: UserIntent | undefined;
  readonly capability?: Capability | undefined;
  /** Give the connection row shipped pricing, so the `estimated` cost arm has an input. */
  readonly pricing?: boolean | undefined;
  /** BB-004 negative arm only: remove the typed chat id immediately before the executor call, simulating an
   *  untyped consumer that bypassed the callback/id contract. The callback must then stay silent. */
  readonly omitChatIdAtRuntime?: true | undefined;
  /** Tools the agent-sdk turn carries (its terminal-tool channel). Ignored on the hosted wires. */
  readonly terminalTools?: readonly WireTool[] | undefined;
}

interface ChatEventSink {
  readonly chatId: ChatId;
  readonly deltas: string[];
  readonly events: ChatEvent[];
}

async function chatRequestFor(root: ServerTestHarness, wire: Wire, options: ChatArmOptions, sink: ChatEventSink): Promise<ChatRequest> {
  const capability = options.capability ?? chatCapability();
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: providerForWire(wire),
    model: modelForWire(wire),
    capability,
    ...(options.pricing === true ? { declaredFeatures: { pricing: PRICING } } : {}),
  });
  const common = {
    connection,
    params: options.params ?? {},
    systemPrompt: { static: "You are a conformance fixture.", dynamic: "" },
    chatId: sink.chatId,
    onDelta: (event: ChatDeltaEvent): void => {
      if (event.kind === "text") {
        sink.deltas.push(event.text);
      }
    },
    onEvent: (event: ChatEvent): void => {
      sink.events.push(event);
    },
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  };
  const history = [{ role: "user" as const, content: [{ type: "text" as const, text: "Say something." }] }];
  if (wire === "agent-sdk") {
    return {
      ...common,
      api: "agent-sdk",
      prompt: "Say something.",
      ...(options.terminalTools !== undefined ? { terminalTools: options.terminalTools } : {}),
    } satisfies AgentSdkChatRequest;
  }
  if (wire === "anthropic-messages") {
    return { ...common, api: "anthropic-messages", history } satisfies AnthropicChatRequest;
  }
  if (wire === "google-generative-ai") {
    return { ...common, api: "google-generative-ai", history };
  }
  return { ...common, api: "chat-completions", history } satisfies OpenAiCompatChatRequest;
}

export function conformanceRoot(options: Parameters<typeof createRuntimeRoot>[0] = {}): Promise<ServerTestHarness> {
  return createRuntimeRoot({
    ids,
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
    wireCapture: true,
    ...options,
  });
}

export async function driveChat(wire: Wire, options: ChatArmOptions): Promise<ChatArmResult> {
  const model = modelForWire(wire);
  await using root = await conformanceRoot(
    wire === "agent-sdk"
      ? { sdkSpawn: physicalSdkScenario({ frames: agentSdkFrames(options.script, model) }).spawn }
      : { providerFetch: scriptedResponses([() => eventResponse(hostedScript(wire, options.script))]) },
  );
  const chatId = await seedRecallRoom(await root.internalCallerFor(root.ownerId));
  const sink: ChatEventSink = { chatId, deltas: [], events: [] };
  const request = await chatRequestFor(root, wire, options, sink);
  const executor = root.app.runtime.executor;
  const turn =
    options.omitChatIdAtRuntime === true
      ? await Reflect.apply(Reflect.get(executor, "runChatTurn"), executor, [
          // Deliberately bypass the compile-time contract to prove each backend's runtime backstop. Reflect
          // keeps the malformed value untyped instead of laundering it through a `ChatRequest` assertion.
          (({ chatId: _chatId, ...withoutChatId }): object => withoutChatId)(request),
        ])
      : await executor.runChatTurn(request);
  const response = await root.http.request(`/api/_debug/wire/captures?chatId=${chatId}`);
  if (response.status !== 200) {
    throw new Error(`the real root's wire-capture door refused its operator: ${response.status}`);
  }
  const capture = wireCapturesResponseSchema.parse(await response.json());
  if (!capture.enabled) {
    throw new Error("the real root's wire capture was not installed");
  }
  return { deltas: sink.deltas, events: sink.events, captured: capture.captures.map((entry) => entry.body), turn };
}

const CONFORMANCE_RESPONSE_FORMAT: ResponseFormat = {
  name: "conformance_answer",
  description: "Record the conformance answer.",
  schema: projectJsonSchema(z.object({ answer: z.string() })),
};

const TRUNCATED_JSON_EVENT = 'data: {"choices": \n\n';

const truncatedEventFetch: typeof fetch = () =>
  Promise.resolve(new Response(TRUNCATED_JSON_EVENT, { status: 200, headers: { "content-type": "text/event-stream" } }));

function agentSdkStructuredFrames(model: string, structuredOutput: unknown): Record<string, unknown>[] {
  return [
    { type: "system", subtype: "init", ["session_id"]: SESSION_ID, apiKeySource: "none", model },
    { type: "assistant", ["session_id"]: SESSION_ID, message: { content: [{ type: "text", text: "" }], ["stop_reason"]: "end_turn" } },
    {
      type: "result",
      subtype: "success",
      ["session_id"]: SESSION_ID,
      ["is_error"]: false,
      ["num_turns"]: 1,
      ["duration_api_ms"]: 5,
      ["terminal_reason"]: "completed",
      errors: [],
      ["permission_denials"]: [],
      ["total_cost_usd"]: 0,
      usage: { ["input_tokens"]: 1, ["output_tokens"]: 1 },
      modelUsage: {},
      ...(structuredOutput === undefined ? {} : { ["structured_output"]: structuredOutput }),
    },
  ];
}

export async function driveStructuredMalformed(wire: Wire): Promise<unknown> {
  const model = modelForWire(wire);
  await using root = await conformanceRoot(
    wire === "agent-sdk"
      ? { sdkSpawn: physicalSdkScenario({ frames: agentSdkStructuredFrames(model, undefined) }).spawn }
      : { providerFetch: truncatedEventFetch },
  );
  const request: StructuredRequest = {
    connection: await wireConnection(root, {
      task: "structured",
      providerId: providerForWire(wire),
      model: wire === "local-light" ? DEFAULT_EMBED_MODEL : model,
      ...(wire === "local-light" ? {} : { capability: chatCapability() }),
    }),
    inputs: [{ systemPrompt: "Answer in JSON.", userPrompt: "What is the answer?" }],
    responseFormat: CONFORMANCE_RESPONSE_FORMAT,
  };
  return await root.app.runtime.executor.structured(request);
}

function embeddingsBody(dims: number): string {
  return JSON.stringify({
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: Array.from({ length: dims }, (_value, i) => ((i % 7) + 1) / 10) }],
    model: "conformance-embed-1",
    usage: { ["prompt_tokens"]: 3, ["total_tokens"]: 3 },
  });
}

async function driveEmbed(wire: Wire, signal?: AbortSignal): Promise<unknown> {
  await using root = await conformanceRoot(
    wire === "local-light"
      ? {}
      : {
          providerFetch: scriptedResponses([
            () =>
              new Response(
                wire === "google-generative-ai" ? JSON.stringify({ embedding: { values: new Array(EMBED_DIMS).fill(1) } }) : embeddingsBody(EMBED_DIMS),
                { headers: { "content-type": "application/json" } },
              ),
          ]),
        },
  );
  const request: EmbedRequest = {
    connection: await wireConnection(root, {
      task: "embed",
      providerId: providerForWire(wire),
      model: wire === "local-light" ? DEFAULT_EMBED_MODEL : "text-embedding-conformance",
      ...(wire === "local-light"
        ? {}
        : { capability: { kind: "embedding" as const, embedding: { ...EMBEDDING_FLOOR, dims: EMBED_DIMS, input: ["text" as const] } } }),
    }),
    input: ["conformance"],
    ...(signal !== undefined ? { signal } : {}),
  };
  return await root.app.runtime.executor.embed(request);
}

export async function settledProviderError(call: () => Promise<unknown>): Promise<{ readonly error: ProviderError | null; readonly value: unknown }> {
  try {
    return { error: null, value: await call() };
  } catch (thrown) {
    if (thrown instanceof ProviderError) {
      return { error: thrown, value: undefined };
    }
    throw thrown;
  }
}

export function warningCodesOf(events: readonly ChatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
}

export function cellTest(wire: Wire, task: ConformanceTask, title: string, body: () => Promise<void>): void {
  const skip = skipReasonFor(wire, task);
  if (skip === "no-driver") {
    throw new Error(`conformance: the served ${wire}/${task} cell has no physical driver`);
  }
  const name = skip === null ? `${wire} — ${title}` : `${wire} — ${title} [SKIPPED: ${skip}]`;
  test.skipIf(skip === "unserved")(name, body);
}

export function cancellationTaskFor(wire: Wire): ConformanceTask {
  const task = CONFORMANCE_TASKS.find((candidate) => skipReasonFor(wire, candidate) === null);
  if (task === undefined) {
    throw new Error(`conformance: the "${wire}" wire has no drivable task — cancellation binds every wire`);
  }
  return task;
}

export function driveCancellable(wire: Wire, signal: AbortSignal): Promise<unknown> {
  const task = cancellationTaskFor(wire);
  if (task === "embed") {
    return driveEmbed(wire, signal);
  }
  const stop = wire === "anthropic-messages" ? "end_turn" : "stop";
  return driveChat(wire, { script: { deltas: ["hello"], stop, tokensIn: 1, tokensOut: 1 }, signal });
}
