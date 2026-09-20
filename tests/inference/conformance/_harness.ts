// tests/inference/conformance/_harness — the CROSS-BACKEND conformance harness: one arm, every wire.
//
// WHY IT EXISTS. `@orb/inference` puts four backends behind one `ProviderBackend` contract and, until this
// suite, nothing asserted they MEAN the same thing. `registry/backends.test.ts` pins `WIRE_DEFS[w].serves`
// against the implemented method NAMES — a SHAPE check that a backend replacement preserving TypeScript
// signatures passes while changing every answer. The 28 byte-equality wire pins prove the request BYTES are
// unchanged; they say nothing about whether an abort still aborts, or whether a malformed non-stream body
// still ERRORS rather than committing an empty reply (#1400's class, where a collapse-to-null fed an
// all-null chunk that committed an empty reply as canon).
//
// THE EXECUTION PATH IS THE REAL ONE. Every arm runs `buildBackends(deps)` → `createProviderExecutor(…)` →
// `runTask`, so each cell crosses the same dispatch seam production does — including the abort FLATTEN
// (`registry/dispatch.ts` → `backends/kit/abort-flatten.ts`), which a direct `backend.runChatTurn(req)` call
// would skip. What differs per wire is only the FIXTURE (which bytes / which SDK frames the fake transport
// produces), because that is the one thing that genuinely cannot be shared.
//
// APPLICABILITY IS DATA, NOT A ROSTER. A cell runs iff `WIRE_DEFS[wire].serves` contains the behaviour's
// task and `BACKEND_DEFS[wire].needs(deps)` is satisfied. A cell that does NOT run asserts its
// {@link SkipReason} is `unserved` — the only admissible one — so a skip caused by a missing driver or an
// unbuilt wire REDS instead of reading exactly like coverage. That inversion is the point: the failure mode
// this lane exists to prevent is a silent skip, which looks identical to a green arm in the report.
//
// THE FAKE TRANSPORT IS RESOLVED AT CONSTRUCTION. `buildBackends` reads `deps.sdkFetch` ONCE inside
// `createServices()`, so a `vi.spyOn(globalThis, "fetch")` installed in a test body is DEAD for anything the
// fixture already built — and has reached a real listening vLLM engine on this box once. Every arm here
// therefore builds its OWN services with the fake already in `deps`. No arm needs a credential; none may.

import type { Capability, GenerationCapability, Task, Wire } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, EMBEDDING_FLOOR, WIRE_DEFS } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import type { ProviderExecutor, WireCaptureSink } from "../../../packages/inference/src/contract/backend.ts";
import type { AgentSdkChatRequest, AnthropicChatRequest, ChatRequest, OpenAiCompatChatRequest } from "../../../packages/inference/src/contract/chat.ts";
import { ProviderError } from "../../../packages/inference/src/contract/errors.ts";
import type { ChatEvent } from "../../../packages/inference/src/contract/events.ts";
import type { EmbedRequest, StructuredRequest } from "../../../packages/inference/src/contract/roles.ts";
import { BACKEND_DEFS, buildBackends } from "../../../packages/inference/src/registry/backends.ts";
import { createProviderExecutor } from "../../../packages/inference/src/roles/executor.ts";
import { test } from "../../support/fixtures.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../_support.ts";
import type { RecordedRequest, SseEvent } from "../backends/_hosted-support.ts";
import { abortAware, generationCapability, scriptedJsonFetch, scriptedSseFetch } from "../backends/_hosted-support.ts";

/** The bundled-runtime path `BACKEND_DEFS["agent-sdk"].needs` gates on. Never spawned: the `query` seam is
 *  faked, so this string only has to be present. */
export const CLAUDE_EXECUTABLE = "/usr/bin/claude";
const SESSION_ID = "sess_conformance";
const CONTEXT_WINDOW = 200_000;
const MAX_OUTPUT_TOKENS = 8192;
/** Row pricing, so the `estimated` cost arm has an input on the wires that report no figure of their own. */
const PRICING = { inputPerMTok: 3, outputPerMTok: 15 };
/** The deployment vector width `fakeDeps` injects (`embedSpace.dims`) — the embed arms must agree with it. */
const EMBED_DIMS = 1024;

/** The tasks this harness can DRIVE. Per-wire applicability is `WIRE_DEFS[wire].serves ∩ this` — derived,
 *  never a per-backend roster; `applicability.suite.test.ts` pins the driver table against it so a wire that
 *  grows a served task cannot quietly fall out of the matrix. */
export const CONFORMANCE_TASKS = ["chat", "structured", "embed"] as const satisfies readonly Task[];
export type ConformanceTask = (typeof CONFORMANCE_TASKS)[number];

/** Why a conformance cell did not run. `unserved` is the ONLY admissible reason — every other member means
 *  the harness lost coverage while still reading green, which is exactly what this suite must not do. */
const SKIP_REASONS = ["unserved", "unbuilt", "no-driver"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** The wires in a stable order — `WIRE_DEFS`' own key order, so a new wire joins every matrix by existing. */
export const CONFORMANCE_WIRES: readonly Wire[] = Object.freeze(Object.keys(WIRE_DEFS) as Wire[]);

/** The provider row an arm for this wire runs as: the FIRST shipped built-in on the wire, READ from
 *  `BUILTIN_PROVIDERS` rather than named here. A wire whose only row is retired then throws instead of
 *  silently exercising a hand-typed id that no longer resolves. */
function providerForWire(wire: Wire): string {
  const row = BUILTIN_PROVIDERS.find((provider) => provider.wire === wire);
  if (row === undefined) {
    throw new Error(`conformance: no built-in provider row for the "${wire}" wire`);
  }
  return row.id;
}

/** Whether the wire's provider row bills per token. The subscription arm of the cost-provenance ruling keys
 *  off THIS, not off a wire name: "a metered wire reporting a cost is `measured`; a subscription's
 *  SDK-computed price is `estimated`, because no invoice exists" (`contracts/inference/usage.ts`). */
export function meteredForWire(wire: Wire): boolean {
  const row = BUILTIN_PROVIDERS.find((provider) => provider.wire === wire);
  return row?.metered === true;
}

function servesConformanceTask(wire: Wire, task: ConformanceTask): boolean {
  return WIRE_DEFS[wire].serves.includes(task);
}

// ── the wire-neutral script ───────────────────────────────────────────────────────────────────────────────

/** ONE arm's intent, rendered into each wire's own frames by {@link driveChat}. The fields are what the
 *  cross-backend laws read: the deltas (reply equality), the raw stop word (the finish fold), the token
 *  counts (the usage core) and an optional wire-reported cost (the provenance arm). */
export interface ChatScript {
  readonly deltas: readonly string[];
  /** The wire's RAW stop word on the terminal frame, or `null` to OMIT the terminal frame entirely — the
   *  #1400 TRUNCATION control: a stream that simply ends must fail closed, never commit an empty reply. */
  readonly stop: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  /** A cost figure on the wire's own accounting channel, where it has one. */
  readonly costUsd?: number | undefined;
}

function openAiChunk(choice: Record<string, unknown>, usage?: Record<string, unknown>): SseEvent {
  return {
    event: "",
    data: { id: "gen-conformance", object: "chat.completion.chunk", created: 1, model: "m", choices: [choice], ...(usage !== undefined ? { usage } : {}) },
  };
}

/** The openai-compat rendering: chat-completion chunks, the cost on `usage.cost` (OpenRouter's accounting). */
function openAiCompatScript(script: ChatScript): SseEvent[] {
  const out = script.deltas.map((text, index) =>
    openAiChunk({ index: 0, delta: index === 0 ? { role: "assistant", content: text } : { content: text }, finish_reason: null }),
  );
  if (script.stop === null) {
    return out;
  }
  out.push(
    openAiChunk(
      { index: 0, delta: {}, finish_reason: script.stop },
      {
        prompt_tokens: script.tokensIn,
        completion_tokens: script.tokensOut,
        total_tokens: script.tokensIn + script.tokensOut,
        ...(script.costUsd !== undefined ? { cost: script.costUsd } : {}),
      },
    ),
  );
  return out;
}

/** The anthropic-messages rendering. The wire has NO cost channel — `costUsd` is inexpressible here, which
 *  is precisely why the provenance law is stated as an implication rather than a per-wire expectation. */
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
          stop_reason: null,
          usage: { input_tokens: script.tokensIn, output_tokens: 1 },
        },
      },
    },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    ...script.deltas.map(
      (text): SseEvent => ({ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } }),
    ),
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
  ];
  if (script.stop === null) {
    return out;
  }
  out.push(
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: script.stop }, usage: { output_tokens: script.tokensOut } } },
    { event: "message_stop", data: { type: "message_stop" } },
  );
  return out;
}

/** The agent-sdk rendering: the SDK's own message frames. `system/init` must satisfy the init-frame SHAPE
 *  GUARD (`backends/agent-sdk/verify.ts`), the `stream_event` frames are what `onDelta` sees, and the
 *  `result` frame is the terminal one whose absence is the wire's truncation failure. */
function agentSdkFrames(script: ChatScript, model: string): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [
    { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "none", model },
    ...script.deltas.map((text) => ({
      type: "stream_event",
      session_id: SESSION_ID,
      event: { type: "content_block_delta", delta: { type: "text_delta", text } },
    })),
    {
      type: "assistant",
      session_id: SESSION_ID,
      message: { content: script.deltas.map((text) => ({ type: "text", text })), stop_reason: script.stop },
    },
  ];
  if (script.stop === null) {
    return frames;
  }
  const costUSD = script.costUsd ?? 0;
  frames.push({
    type: "result",
    subtype: "success",
    session_id: SESSION_ID,
    is_error: false,
    num_turns: 1,
    duration_api_ms: 5,
    ttft_ms: 1,
    total_cost_usd: costUSD,
    stop_reason: script.stop,
    terminal_reason: "completed",
    errors: [],
    permission_denials: [],
    usage: { input_tokens: script.tokensIn, output_tokens: script.tokensOut },
    modelUsage: {
      [model]: {
        inputTokens: script.tokensIn,
        outputTokens: script.tokensOut,
        cacheReadInputTokens: 0,
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

/** An agent-sdk `query` stand-in over pre-rendered frames. Honours `options.abortController` the way the
 *  bundled runtime does — rejecting with the signal's OWN reason — so the cancellation arm can read WHICH
 *  reason reached the transport rather than merely that the turn ended. */
function fakeQuery(frames: readonly Record<string, unknown>[]): unknown {
  return (args: { readonly options?: { readonly abortController?: AbortController } }): AsyncGenerator<Record<string, unknown>> => {
    const signal = args.options?.abortController?.signal;
    return (async function* stream(): AsyncGenerator<Record<string, unknown>> {
      for (const frame of frames) {
        await Promise.resolve();
        if (signal?.aborted === true) {
          throw signal.reason;
        }
        yield frame;
      }
    })();
  };
}

// ── the built runtime ─────────────────────────────────────────────────────────────────────────────────────

/** One built inference runtime plus the two observation points every arm reads: the send-boundary capture
 *  (`captureWire`, the ONE body channel that exists on every wire) and the wires the registry SKIPPED. */
interface ConformanceRuntime {
  readonly executor: ProviderExecutor;
  readonly captured: { readonly api: string; readonly wire: Wire; readonly body: Record<string, unknown> }[];
  readonly skipped: ReadonlyMap<Wire, string>;
}

function buildRuntime(options: { readonly fetch?: typeof fetch | undefined; readonly agentSdkQuery?: unknown }): ConformanceRuntime {
  const captured: { api: string; wire: Wire; body: Record<string, unknown> }[] = [];
  const captureWire: WireCaptureSink = (entry) => {
    captured.push({ api: entry.api, wire: entry.wire, body: entry.body });
  };
  const deps = fakeDeps({
    claudeExecutable: CLAUDE_EXECUTABLE,
    captureWire,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.agentSdkQuery !== undefined ? { agentSdkQuery: options.agentSdkQuery } : {}),
  });
  const built = buildBackends(deps);
  return { executor: createProviderExecutor({ registry: built.registry, span: deps.span }), captured, skipped: built.skipped };
}

/** The deps `BACKEND_DEFS[wire].needs` is evaluated against for {@link skipReasonFor} — the SAME shape every
 *  arm builds, so "would this wire be built?" is answered from the conformance posture, not a guess. */
export function conformanceNeedsMissing(wire: Wire): string | null {
  return BACKEND_DEFS[wire].needs(fakeDeps({ claudeExecutable: CLAUDE_EXECUTABLE }));
}

/** THE ANTI-VACUITY DECISION. `null` ⇒ the cell RUNS. Anything else is a skip whose reason the calling arm
 *  asserts is `unserved`: a `no-driver` or `unbuilt` cell must RED, because in a report it reads exactly
 *  like a passing one. */
export function skipReasonFor(wire: Wire, task: ConformanceTask): SkipReason | null {
  if (!servesConformanceTask(wire, task)) {
    return "unserved";
  }
  if (conformanceNeedsMissing(wire) !== null) {
    return "unbuilt";
  }
  return hasDriver(wire, task) ? null : "no-driver";
}

/** Which (wire, task) cells the harness can actually drive. Kept as a predicate over the driver functions
 *  below rather than a literal table, so adding a driver is one edit and the coverage pin re-derives. It is
 *  never consulted to decide APPLICABILITY — `WIRE_DEFS[wire].serves` does that; this only answers "and can
 *  the harness reach it?", and `applicability.suite.test.ts` reds when the two disagree. (They did, on that
 *  pin's very first run: `openai-compat` serves `embed` and had no driver.) */
export function hasDriver(wire: Wire, task: ConformanceTask): boolean {
  if (task === "chat" || task === "structured") {
    return wire === "openai-compat" || wire === "anthropic-messages" || wire === "agent-sdk";
  }
  return wire === "local-light" || wire === "openai-compat";
}

// ── the drivers ───────────────────────────────────────────────────────────────────────────────────────────

/** The generation capability every chat/structured arm resolves against, plus whichever axis an arm narrows
 *  to force a degrade (the unsupported-settings law hands `{ sampling: {} }`). */
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
}

function chatRequestFor(wire: Wire, options: ChatArmOptions, sink: { deltas: string[]; events: ChatEvent[] }): ChatRequest {
  const capability = options.capability ?? chatCapability();
  const connection = fakeResolved({
    task: "chat",
    providerId: providerForWire(wire),
    model: modelForWire(wire),
    capability,
    secret: fakeApiKeySecret("conformance-not-a-real-key"),
    ...(options.pricing === true ? { declaredFeatures: { pricing: PRICING } } : {}),
  });
  const common = {
    connection,
    params: options.params ?? {},
    systemPrompt: { static: "You are a conformance fixture.", dynamic: "" },
    onDelta: (event: { readonly kind: string; readonly text?: string }): void => {
      if (event.kind === "text" && event.text !== undefined) {
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
    return { ...common, api: "agent-sdk", prompt: "Say something." } satisfies AgentSdkChatRequest;
  }
  if (wire === "anthropic-messages") {
    return { ...common, api: "anthropic-messages", history } satisfies AnthropicChatRequest;
  }
  return { ...common, api: "chat-completions", history } satisfies OpenAiCompatChatRequest;
}

function runtimeFor(wire: Wire, frames: () => Record<string, unknown>[], sse: () => SseEvent[], recorded: RecordedRequest[]): ConformanceRuntime {
  return wire === "agent-sdk" ? buildRuntime({ agentSdkQuery: fakeQuery(frames()) }) : buildRuntime({ fetch: abortAware(scriptedSseFetch([sse()], recorded)) });
}

/** Drive ONE chat turn on ONE wire through the real executor. Resolves with the turn plus everything the
 *  cross-backend laws read; REJECTS with whatever the wire threw (the failure arms assert on that). */
export async function driveChat(wire: Wire, options: ChatArmOptions): Promise<ChatArmResult> {
  const sink = { deltas: [] as string[], events: [] as ChatEvent[] };
  const recorded: RecordedRequest[] = [];
  const model = modelForWire(wire);
  const runtime = runtimeFor(
    wire,
    () => agentSdkFrames(options.script, model),
    () => (wire === "anthropic-messages" ? anthropicScript(options.script) : openAiCompatScript(options.script)),
    recorded,
  );
  const turn = await runtime.executor.runChatTurn(chatRequestFor(wire, options, sink));
  return { deltas: sink.deltas, events: sink.events, captured: runtime.captured.map((entry) => entry.body), turn };
}

// ── the structured driver ─────────────────────────────────────────────────────────────────────────────────

/** The one schema every structured arm asks for. `projectJsonSchema` is the only producer of the
 *  `WireReady` brand `ResponseFormat.schema` requires (D79). */
const CONFORMANCE_RESPONSE_FORMAT: ResponseFormat = {
  name: "conformance_answer",
  description: "Record the conformance answer.",
  schema: projectJsonSchema(z.object({ answer: z.string() })),
};

/** THE MALFORMED NON-STREAM BODY (#1400): a truncated JSON object. A wire that answers this with a RESOLVED
 *  result holding an empty item is the collapse-to-null defect class; a wire that answers with a typed
 *  `ProviderError` is conformant. */
const TRUNCATED_JSON_BODY = '{"choices": ';

/** The agent-sdk analogue of a malformed structured payload: a `result` frame with NO `structured_output`,
 *  which is what that wire produces when the runtime's schema pass yields nothing. */
function agentSdkStructuredFrames(model: string, structuredOutput: unknown): Record<string, unknown>[] {
  return [
    { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "none", model },
    { type: "assistant", session_id: SESSION_ID, message: { content: [{ type: "text", text: "" }], stop_reason: "end_turn" } },
    {
      type: "result",
      subtype: "success",
      session_id: SESSION_ID,
      is_error: false,
      num_turns: 1,
      duration_api_ms: 5,
      terminal_reason: "completed",
      errors: [],
      permission_denials: [],
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1 },
      modelUsage: {},
      ...(structuredOutput === undefined ? {} : { structured_output: structuredOutput }),
    },
  ];
}

/** Run the `structured` task on ONE wire against a MALFORMED payload. Returns the settled outcome so the arm
 *  can assert on BOTH shapes — a rejection is conformant, a resolution is the defect. */
export function driveStructuredMalformed(wire: Wire): Promise<unknown> {
  const model = modelForWire(wire);
  const recorded: RecordedRequest[] = [];
  const runtime =
    wire === "agent-sdk"
      ? buildRuntime({ agentSdkQuery: fakeQuery(agentSdkStructuredFrames(model, undefined)) })
      : buildRuntime({ fetch: abortAware(scriptedJsonFetch([TRUNCATED_JSON_BODY], recorded)) });
  const request: StructuredRequest = {
    connection: fakeResolved({
      task: "structured",
      providerId: providerForWire(wire),
      model,
      capability: chatCapability(),
      secret: fakeApiKeySecret("conformance-not-a-real-key"),
    }),
    inputs: [{ systemPrompt: "Answer in JSON.", userPrompt: "What is the answer?" }],
    responseFormat: CONFORMANCE_RESPONSE_FORMAT,
  };
  return runtime.executor.structured(request);
}

// ── the embed driver (the local-light cell) ───────────────────────────────────────────────────────────────

/** An OpenAI-dialect embeddings response at the deployment's vector width. The hosted embed path is a plain
 *  POST rather than a stream, so this is a JSON body, not an SSE script. */
function embeddingsBody(dims: number): string {
  return JSON.stringify({
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: Array.from({ length: dims }, (_value, i) => ((i % 7) + 1) / 10) }],
    model: "conformance-embed-1",
    usage: { prompt_tokens: 3, total_tokens: 3 },
  });
}

function driveEmbed(wire: Wire, signal?: AbortSignal): Promise<unknown> {
  // `local-light` runs in-process against the fake model cache and issues no request at all; the hosted wire
  // POSTs, so it gets a scripted JSON transport. Both reach the SAME `executor.embed` seam.
  const runtime = wire === "local-light" ? buildRuntime({}) : buildRuntime({ fetch: abortAware(scriptedJsonFetch([embeddingsBody(EMBED_DIMS)], [])) });
  const request: EmbedRequest = {
    connection: fakeResolved({
      task: "embed",
      providerId: providerForWire(wire),
      model: wire === "local-light" ? "jinaai/jina-clip-v2" : "text-embedding-conformance",
      capability: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: EMBED_DIMS, input: ["text"] } },
    }),
    input: ["conformance"],
    ...(signal !== undefined ? { signal } : {}),
  };
  return runtime.executor.embed(request);
}

// ── shared assertions ─────────────────────────────────────────────────────────────────────────────────────

/** Settle a call into the thrown `ProviderError`, or `null` when it RESOLVED. A resolution is never silently
 *  acceptable on a failure arm — #1400 is exactly "it resolved when it should have thrown" — so the arm
 *  asserts on `value` rather than on a bare `.rejects`, which accepts any rejection and reports nothing
 *  useful about a resolution. A thrown value that is NOT a `ProviderError` is re-thrown rather than folded
 *  in: "the wire leaked a raw transport object" must surface as a loud failure, not as a quiet `null` kind.
 *
 *  IT TAKES A THUNK, not a promise, because `registry/dispatch.ts::runTask` resolves the backend and the
 *  method SYNCHRONOUSLY: asking an unwired wire for a task it does not serve THROWS at call time rather than
 *  rejecting, even though the signature says `Promise<Res>`. A `settled(executor.structured(req))` never gets
 *  the chance to catch it. */
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

/** The warning codes a turn surfaced on its `warning` events — the D41 no-silent-degrade receipt. */
export function warningCodesOf(events: readonly ChatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
}

/**
 * The per-cell `test` every behaviour arm declares through. A cell the DATA says is inapplicable is skipped
 * WITH ITS REASON IN THE TITLE — never silently — and `applicability.suite.test.ts` separately REDS when that
 * reason is anything but `unserved`. Two mechanisms on purpose: the title makes the gap visible in every
 * report, the pin makes it fail the run. A silent skip reads exactly like coverage, which is the single
 * failure mode this whole suite exists to prevent.
 */
export function cellTest(wire: Wire, task: ConformanceTask, title: string, body: () => Promise<void>): void {
  const skip = skipReasonFor(wire, task);
  test.skipIf(skip !== null)(skip === null ? `${wire} — ${title}` : `${wire} — ${title} [SKIPPED: ${skip}]`, body);
}

/** The task each wire is CANCELLED on: the FIRST conformance task it both serves and the harness can drive.
 *  Derived rather than listed, so `local-light` — which serves no chat — is probed on `embed` instead of
 *  quietly falling out of the one law that binds every wire regardless of what it serves. */
export function cancellationTaskFor(wire: Wire): ConformanceTask {
  const task = CONFORMANCE_TASKS.find((candidate) => skipReasonFor(wire, candidate) === null);
  if (task === undefined) {
    throw new Error(`conformance: the "${wire}" wire has no drivable task — cancellation binds every wire`);
  }
  return task;
}

/** Run the wire's cancellation task under `signal`. The signal reaches the backend through the REAL
 *  `runTask` seam, which is where `flattenAbortSignal` lives — a direct `backend.<method>(req)` call would
 *  skip the flatten and the pin would prove nothing about which REASON reached the transport. */
export function driveCancellable(wire: Wire, signal: AbortSignal): Promise<unknown> {
  const task = cancellationTaskFor(wire);
  if (task === "embed") {
    return driveEmbed(wire, signal);
  }
  const stop = wire === "anthropic-messages" ? "end_turn" : "stop";
  return driveChat(wire, { script: { deltas: ["hello"], stop, tokensIn: 1, tokensOut: 1 }, signal });
}
