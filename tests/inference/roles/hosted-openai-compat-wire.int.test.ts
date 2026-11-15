// @subject packages/contracts/src/inference/builtin-providers.ts
// The hosted OpenAI-compatible rows chat with only a key: each stream ends with its usage, NanoGPT carries the
// chosen effort out and its reasoning back, and each service's own error bodies reach a named failure.
import type { ChatDeltaEvent } from "@orb/contracts/chat";
import type { SamplerKnob } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, DEFAULT_SAMPLER_KEYS, SAMPLER_KNOBS, WARNING_CODE } from "@orb/contracts/inference";
import type { ProviderErrorKind } from "@orb/inference";
import { MS_PER_SECOND } from "@orb/kit/time";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { seedRecallRoom } from "@orb/testkit/node/composed";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { settledProviderError } from "../conformance/runtime.fixtures.ts";
import type { SseEvent } from "../conformance/transport.fixtures.ts";
import { eventResponse, scriptedResponses } from "../conformance/transport.fixtures.ts";
import {
  createRuntimeRoot,
  ESCAPED_HAZARD_WORDS,
  generationCapability,
  NANOGPT_FORBIDDEN_BODIES,
  observeRuntimeTimers,
  RUNTIME_KEY,
  wireConnection,
} from "./runtime.fixtures.ts";

const HOSTED_ROWS = ["nanogpt", "literouter"] as const;
type HostedRow = (typeof HOSTED_ROWS)[number];

const CHAT_URLS: Record<HostedRow, string> = {
  nanogpt: "https://api.nano-gpt.com/api/v1/chat/completions",
  literouter: "https://api.literouter.com/v1/chat/completions",
};

const TOKENS_IN = 41;
const TOKENS_OUT = 7;
const REQUEST_TIMEOUT_MS = 50;
const RETRY_AFTER_SECONDS = 2;
// The HTTP wires' pre-commit retry budget: the first try and two retries.
const RETRY_ATTEMPTS = 3;

const EFFORT_CAPABILITY = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });
const USER_LINE = { role: "user" as const, content: [{ type: "text" as const, text: "Hello." }] };

function chunk(delta: Record<string, unknown>, finish: string | null, usage?: Record<string, unknown>): SseEvent {
  return {
    event: "",
    data: {
      id: "chatcmpl-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "m",
      choices: [{ index: 0, delta, ["finish_reason"]: finish }],
      ...(usage === undefined ? {} : { usage }),
    },
  };
}

// The docs' stream: content deltas, then the terminal chunk carrying `finish_reason` and the `include_usage` totals.
function streamOf(deltas: readonly Record<string, unknown>[]): Response {
  const usage = { ["prompt_tokens"]: TOKENS_IN, ["completion_tokens"]: TOKENS_OUT, ["total_tokens"]: TOKENS_IN + TOKENS_OUT };
  return eventResponse([...deltas.map((delta) => chunk(delta, null)), chunk({}, "stop", usage)]);
}

function errorReply(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): () => Response {
  return () => Response.json(body, { status, headers });
}

function kindAndText(event: ChatDeltaEvent): { readonly kind: ChatDeltaEvent["kind"]; readonly text: string | undefined } {
  return { kind: event.kind, text: "text" in event ? event.text : undefined };
}

interface Turn {
  readonly recorded: readonly RecordedRequest[];
  readonly deltas: readonly ChatDeltaEvent[];
  readonly turn: Awaited<ReturnType<Awaited<ReturnType<typeof createRuntimeRoot>>["app"]["runtime"]["executor"]["runChatTurn"]>>;
}

async function chatTurn(providerId: HostedRow, reply: () => Response, effort?: "high"): Promise<Turn> {
  const recorded: RecordedRequest[] = [];
  using server = scriptedResponses([reply], recorded);
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, { task: "chat", providerId, model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
  const deltas: ChatDeltaEvent[] = [];
  const turn = await root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection,
    signal: new AbortController().signal,
    // The delta callback is a chat room's stream, so the turn names one.
    chatId: await seedRecallRoom(await root.internalCallerFor(root.ownerId)),
    params: effort === undefined ? {} : { effort },
    systemPrompt: { static: "You are a fixture.", dynamic: "" },
    history: [USER_LINE],
    onDelta: (event) => {
      deltas.push(event);
    },
  });
  return { recorded, deltas, turn };
}

test.for(HOSTED_ROWS)("a %s turn streams under the key and ends with the stream's usage", async (providerId) => {
  const { recorded, deltas, turn } = await chatTurn(providerId, () => streamOf([{ role: "assistant", content: "Hi" }, { content: " there." }]));
  expect(recorded.map((request) => ({ url: request.url, authorization: request.headers["authorization"] }))).toEqual([
    { url: CHAT_URLS[providerId], authorization: `Bearer ${RUNTIME_KEY}` },
  ]);
  expect(recorded[0]?.body).toMatchObject({ stream: true, ["stream_options"]: { ["include_usage"]: true } });
  expect(deltas.map(kindAndText)).toEqual([
    { kind: "text", text: "Hi" },
    { kind: "text", text: " there." },
  ]);
  expect(turn.usage).toMatchObject({ tokensIn: TOKENS_IN, tokensOut: TOKENS_OUT });
});

test("a NanoGPT turn sends the chosen effort as reasoning_effort and streams the reasoning back apart from the reply", async () => {
  const { recorded, deltas } = await chatTurn("nanogpt", () => streamOf([{ role: "assistant", reasoning: "Weighing it." }, { content: "Done." }]), "high");
  expect(recorded[0]?.body["reasoning_effort"]).toBe("high");
  expect(deltas.map(kindAndText)).toEqual([
    { kind: "reasoning", text: "Weighing it." },
    { kind: "text", text: "Done." },
  ]);
});

// NanoGPT's Streaming Protocol page: "Tool calls stream via `delta.tool_calls[]`. Accumulate `function.arguments`
// across frames for the same `tool_calls[index]`."
const LOOKUP_TOOL = { name: "lookup", description: "Look a city up.", parameters: { type: "object", properties: { city: { type: "string" } } } };
const LOOKUP_ARGUMENTS = '{"city":"Paris"}';

test("a NanoGPT tool call streamed in argument pieces comes back as one call with the whole arguments", async () => {
  const recorded: RecordedRequest[] = [];
  const usage = { ["prompt_tokens"]: TOKENS_IN, ["completion_tokens"]: TOKENS_OUT, ["total_tokens"]: TOKENS_IN + TOKENS_OUT };
  const call = (fn: Record<string, string>, head: Record<string, string> = {}): Record<string, unknown> => ({
    ["tool_calls"]: [{ index: 0, ...head, function: fn }],
  });
  using server = scriptedResponses(
    [
      (): Response =>
        eventResponse([
          chunk({ role: "assistant", ...call({ name: LOOKUP_TOOL.name, arguments: "" }, { id: "call_1", type: "function" }) }, null),
          chunk(call({ arguments: LOOKUP_ARGUMENTS.slice(0, 8) }), null),
          chunk(call({ arguments: LOOKUP_ARGUMENTS.slice(8) }), null),
          chunk({}, "tool_calls", usage),
        ]),
    ],
    recorded,
  );
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, { task: "chat", providerId: "nanogpt", model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
  const turn = await root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection,
    signal: new AbortController().signal,
    params: {},
    systemPrompt: { static: "You are a fixture.", dynamic: "" },
    history: [USER_LINE],
    tools: [LOOKUP_TOOL],
  });
  expect(recorded[0]?.body["tools"]).toMatchObject([{ type: "function", function: { name: LOOKUP_TOOL.name } }]);
  expect(turn.toolCalls?.map(({ toolCallId, name, arguments: args }) => ({ toolCallId, name, args }))).toEqual([
    { toolCallId: "call_1", name: LOOKUP_TOOL.name, args: LOOKUP_ARGUMENTS },
  ]);
});

// NanoGPT's Error Handling page, verbatim: a mid-stream failure is a chunk with `finish_reason: "error"` and an
// `error` object, then `[DONE]`; "treat it as a failed request".
const MID_STREAM_ERROR = {
  id: "chatcmpl_fixture",
  object: "chat.completion.chunk",
  choices: [{ index: 0, delta: {}, ["finish_reason"]: "error" }],
  error: { status: 503, message: "Service temporarily unavailable. Please try again later.", code: "service_unavailable" },
};

test("a NanoGPT error frame after streamed text fails the turn in the service's words", async () => {
  const frames = [chunk({ role: "assistant", content: "Hel" }, null).data, MID_STREAM_ERROR];
  const reply = (): Response =>
    new Response(`${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  const recorded: RecordedRequest[] = [];
  const settled = await settledProviderError(async () => {
    using server = scriptedResponses([reply], recorded);
    await using root = await createRuntimeRoot({ providerFetch: server.execute });
    const connection = await wireConnection(root, { task: "chat", providerId: "nanogpt", model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
    return await root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      signal: new AbortController().signal,
      params: {},
      systemPrompt: { static: "You are a fixture.", dynamic: "" },
      history: [USER_LINE],
    });
  });
  expect(settled.error?.message).toContain(MID_STREAM_ERROR.error.message);
  expect(settled.error?.kind).toBe("server");
  expect(recorded).toHaveLength(1);
});

// The frame's `status` is the HTTP status the failure would have carried before the stream (Error Handling page:
// retry only on 408, 429, 500, 503); it picks the kind through the same table. The text before it commits the turn,
// so no frame retries.
const FRAME_KINDS: readonly { readonly status: number; readonly code: string; readonly kind: ProviderErrorKind }[] = [
  { status: 402, code: "insufficient_balance", kind: "billing" },
  { status: 429, code: "rate_limited", kind: "rate_limit" },
  { status: 400, code: "context_length_exceeded", kind: "invalid" },
];

test.for(FRAME_KINDS)("a NanoGPT error frame with status $status fails the turn as $kind", async ({ status, code, kind }) => {
  const frame = { ...MID_STREAM_ERROR, error: { status, message: "Stopped.", code } };
  const frames = [chunk({ role: "assistant", content: "Hel" }, null).data, frame];
  const reply = (): Response =>
    new Response(`${frames.map((entry) => `data: ${JSON.stringify(entry)}\n\n`).join("")}data: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  const recorded: RecordedRequest[] = [];
  const settled = await settledProviderError(async () => {
    using server = scriptedResponses([reply], recorded);
    await using root = await createRuntimeRoot({ providerFetch: server.execute });
    const connection = await wireConnection(root, { task: "chat", providerId: "nanogpt", model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
    return await root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      signal: new AbortController().signal,
      params: {},
      systemPrompt: { static: "You are a fixture.", dynamic: "" },
      history: [USER_LINE],
    });
  });
  expect(settled.error?.kind).toBe(kind);
  expect(settled.error?.apiErrorStatus).toBe(status);
  expect(recorded).toHaveLength(1);
});

// Error bodies as each service answers them live: NanoGPT's nested object for a missing or wrong key, its bare
// string plus convenience fields for an empty balance, and its nested refusal of an effort the model does not list;
// LiteRouter's bare string for a wrong key.
const NANOGPT_EMPTY_BALANCE = {
  error: "Insufficient balance",
  message: "Insufficient USD balance. Available 0.000000 USD, required 0.000001 USD.",
  estimatedOutputTokens: 16,
  code: "insufficient_balance",
  balanceCurrency: "USD",
  availableBalance: 0,
  requiredBalance: 9e-7,
  baseModelCoveredBySubscription: false,
  baseModelCoveredByFreeAccess: false,
  balanceReason: "base_request",
  status: 402,
};
const REFUSALS: readonly {
  readonly answer: string;
  readonly providerId: HostedRow;
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly kind: ProviderErrorKind;
}[] = [
  {
    answer: "missing key",
    providerId: "nanogpt",
    status: 401,
    body: { error: { message: "Invalid Authentication", type: "invalid_request_error", code: "missing_api_key", status: 401 } },
    kind: "auth_failed",
  },
  {
    answer: "wrong key",
    providerId: "nanogpt",
    status: 401,
    body: { error: { message: "Invalid session", type: "invalid_api_key", code: "invalid_api_key", status: 401 } },
    kind: "auth_failed",
  },
  { answer: "empty balance", providerId: "nanogpt", status: 402, body: NANOGPT_EMPTY_BALANCE, kind: "billing" },
  {
    answer: "unlisted effort",
    providerId: "nanogpt",
    status: 400,
    body: {
      error: {
        message: 'Invalid value for reasoning_effort on model "vendor/chat-model": "max". Supported values are: none, low, high.',
        type: "invalid_request_error",
        param: "reasoning_effort",
        code: "unsupported_reasoning_effort",
      },
    },
    kind: "invalid",
  },
  { answer: "wrong key", providerId: "literouter", status: 401, body: { error: "[LiteRouter] Invalid or missing API key" }, kind: "auth_failed" },
];

test.for(REFUSALS)("a $providerId $answer answer fails the turn as $kind without a retry", async ({ providerId, status, body, kind }) => {
  const recorded: RecordedRequest[] = [];
  const settled = await settledProviderError(async () => {
    using server = scriptedResponses([errorReply(status, body)], recorded);
    await using root = await createRuntimeRoot({ providerFetch: server.execute });
    const connection = await wireConnection(root, { task: "chat", providerId, model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
    return await root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      signal: new AbortController().signal,
      params: {},
      systemPrompt: { static: "You are a fixture.", dynamic: "" },
      history: [USER_LINE],
    });
  });
  expect(settled.error?.kind).toBe(kind);
  expect(recorded).toHaveLength(1);
});

test("a LiteRouter stream that names its reasoning twice and repeats its stop on the usage chunk reads each once", async () => {
  // The live stream's shape: every reasoning delta under both keys, then a stop chunk, then a usage chunk that
  // repeats the stop.
  const usage = { ["prompt_tokens"]: TOKENS_IN, ["completion_tokens"]: TOKENS_OUT, ["total_tokens"]: TOKENS_IN + TOKENS_OUT };
  const live = (): Response =>
    eventResponse([
      chunk({ role: "assistant" }, null),
      chunk({ reasoning: "Weighing", ["reasoning_content"]: "Weighing" }, null),
      chunk({ reasoning: " it.", ["reasoning_content"]: " it." }, null),
      chunk({ content: "Done." }, null),
      chunk({ content: "", role: "assistant" }, "stop"),
      chunk({ content: "", role: "assistant" }, "stop", usage),
    ]);
  const { deltas, turn } = await chatTurn("literouter", live, "high");
  expect(deltas.map(kindAndText)).toEqual([
    { kind: "reasoning", text: "Weighing" },
    { kind: "reasoning", text: " it." },
    { kind: "text", text: "Done." },
  ]);
  expect(turn.usage).toMatchObject({ tokensIn: TOKENS_IN, tokensOut: TOKENS_OUT });
});

// What a refusal does to the stored key. LiteRouter's 403s (live bodies) and NanoGPT's (its Error Handling page)
// are refusals unless the body's structured code names the key; their 401s and every other row's 403 strike it.
const LITEROUTER_MISSPELLED = "[LiteRouter] Model 'vendor/chat-model' is not available or misspelled";
const LITEROUTER_COOLDOWN =
  "[LiteRouter] Rate limit exceeded for your tier (7 seconds between messages). You can upgrade your tier to reduce the cooldown period.";
const STRIKES: readonly {
  readonly name: string;
  readonly providerId: string;
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly kind: ProviderErrorKind;
  readonly struck: boolean;
}[] = [
  {
    name: "a LiteRouter 403 for a misspelled model",
    providerId: "literouter",
    status: 403,
    body: { error: LITEROUTER_MISSPELLED },
    kind: "invalid",
    struck: false,
  },
  {
    name: "a LiteRouter 403 for the plan cooldown",
    providerId: "literouter",
    status: 403,
    body: { error: LITEROUTER_COOLDOWN },
    kind: "invalid",
    struck: false,
  },
  {
    name: "a LiteRouter 401",
    providerId: "literouter",
    status: 401,
    body: { error: "[LiteRouter] Invalid or missing API key" },
    kind: "auth_failed",
    struck: true,
  },
  {
    name: "a NanoGPT 403 that declines the request for this account",
    providerId: "nanogpt",
    status: 403,
    body: {
      error: {
        message: "This request can't be sent to Claude on this account for now.",
        type: "permission_error",
        code: "claude_request_declined",
      },
    },
    kind: "invalid",
    struck: false,
  },
  {
    name: "a NanoGPT 401",
    providerId: "nanogpt",
    status: 401,
    body: { error: { message: "Invalid session", type: "invalid_api_key", code: "invalid_api_key", status: 401 } },
    kind: "auth_failed",
    struck: true,
  },
  // A 403 whose structured code names the key judges it; words alone never do. The key check reads the same bodies.
  {
    name: "a NanoGPT 403 whose code names a wrong key",
    providerId: "nanogpt",
    status: 403,
    body: NANOGPT_FORBIDDEN_BODIES.wrongKey,
    kind: "auth_failed",
    struck: true,
  },
  {
    name: "a NanoGPT 403 whose code names a missing key",
    providerId: "nanogpt",
    status: 403,
    body: NANOGPT_FORBIDDEN_BODIES.missingKey,
    kind: "auth_failed",
    struck: true,
  },
  {
    name: "a NanoGPT 403 for a model the account cannot use",
    providerId: "nanogpt",
    status: 403,
    body: NANOGPT_FORBIDDEN_BODIES.unsupportedModel,
    kind: "invalid",
    struck: false,
  },
  {
    name: "a NanoGPT 403 whose words name the key",
    providerId: "nanogpt",
    status: 403,
    body: NANOGPT_FORBIDDEN_BODIES.keyWordsOnly,
    kind: "invalid",
    struck: false,
  },
  {
    name: "a LiteRouter 403 whose words name the key",
    providerId: "literouter",
    status: 403,
    body: { error: "[LiteRouter] Invalid or missing API key" },
    kind: "invalid",
    struck: false,
  },
  {
    name: "an OpenAI 403",
    providerId: "openai",
    status: 403,
    body: { error: { message: "Forbidden", type: "invalid_request_error" } },
    kind: "auth_failed",
    struck: true,
  },
  { name: "an OpenRouter 403", providerId: "openrouter", status: 403, body: { error: { message: "Forbidden", code: 403 } }, kind: "auth_failed", struck: true },
];

test.for(STRIKES)("$name fails the turn as $kind once, and strikes the key: $struck", async ({ providerId, status, body, kind, struck }) => {
  const recorded: RecordedRequest[] = [];
  using server = scriptedResponses([errorReply(status, body)], recorded);
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, { task: "chat", providerId, model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
  const settled = await settledProviderError(() =>
    root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      signal: new AbortController().signal,
      params: {},
      systemPrompt: { static: "You are a fixture.", dynamic: "" },
      history: [USER_LINE],
    }),
  );
  // The stored key is this case's subject, so it is read first: a broken seam goes red here, not on the kind.
  const [credential, ...others] = await (await root.internalCallerFor(root.ownerId)).credentials.list();
  expect(others).toEqual([]);
  expect(credential?.revokedReason ?? null).toBe(struck ? "auth_failed" : null);
  expect(settled.error?.kind).toBe(kind);
  expect(recorded).toHaveLength(1);
});

// The same rule holds on either side of the stream start: an error frame's 403 strikes the key on a NanoGPT or
// LiteRouter row only when its structured code names the key, and a 401 frame strikes on every row, as before the
// stream. A row without the 403 rule (OpenRouter) strikes on any 403 frame.
const FRAME_POSITIONS = [
  { position: "after streamed text", lead: [chunk({ role: "assistant", content: "Hel" }, null).data] },
  { position: "before any text", lead: [] },
] as const;
const FRAME_VERDICTS = [
  { providerId: "nanogpt", status: 403, code: "model_not_allowed", kind: "invalid", struck: false },
  { providerId: "nanogpt", status: 403, code: "invalid_api_key", kind: "auth_failed", struck: true },
  { providerId: "nanogpt", status: 401, code: "unauthorized", kind: "auth_failed", struck: true },
  { providerId: "literouter", status: 403, code: "model_not_allowed", kind: "invalid", struck: false },
  { providerId: "literouter", status: 403, code: "invalid_api_key", kind: "auth_failed", struck: true },
  { providerId: "literouter", status: 401, code: "unauthorized", kind: "auth_failed", struck: true },
  { providerId: "openrouter", status: 403, code: "model_not_allowed", kind: "auth_failed", struck: true },
  { providerId: "openrouter", status: 401, code: "unauthorized", kind: "auth_failed", struck: true },
] as const satisfies readonly {
  readonly providerId: string;
  readonly status: number;
  readonly code: string;
  readonly kind: ProviderErrorKind;
  readonly struck: boolean;
}[];
const FRAME_STRIKES = FRAME_POSITIONS.flatMap(({ position, lead }) => FRAME_VERDICTS.map((verdict) => ({ ...verdict, position, lead })));

test.for(FRAME_STRIKES)(
  "a $providerId $status frame coded $code $position fails the turn as $kind, and strikes the key: $struck",
  async ({ providerId, status, code, kind, struck, lead }) => {
    const frames = [...lead, { ...MID_STREAM_ERROR, error: { status, message: "Stopped.", code } }];
    const reply = (): Response =>
      new Response(`${frames.map((entry) => `data: ${JSON.stringify(entry)}\n\n`).join("")}data: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    const recorded: RecordedRequest[] = [];
    using server = scriptedResponses([reply], recorded);
    await using root = await createRuntimeRoot({ providerFetch: server.execute });
    const connection = await wireConnection(root, { task: "chat", providerId, model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
    const settled = await settledProviderError(() =>
      root.app.runtime.executor.runChatTurn({
        api: "chat-completions",
        connection,
        signal: new AbortController().signal,
        params: {},
        systemPrompt: { static: "You are a fixture.", dynamic: "" },
        history: [USER_LINE],
      }),
    );
    const [credential, ...others] = await (await root.internalCallerFor(root.ownerId)).credentials.list();
    expect(others).toEqual([]);
    expect(credential?.revokedReason ?? null).toBe(struck ? "auth_failed" : null);
    expect(settled.error?.kind).toBe(kind);
    expect(settled.error?.apiErrorStatus).toBe(status);
    expect(recorded).toHaveLength(1);
  },
);

// Each hazard reaches the wire as a `\u` escape, so only the decoded words carry it.
const HAZARD_BODIES: Record<HostedRow, string> = {
  literouter: `{"error":"${ESCAPED_HAZARD_WORDS.wire}"}`,
  nanogpt: `{"error":{"message":"${ESCAPED_HAZARD_WORDS.wire}","type":"permission_error","code":"claude_request_declined"}}`,
};

test.for(HOSTED_ROWS)("a %s 403 shows its decoded words with no markup, control character, bidi override or key", async (providerId) => {
  const hazard = (): Response => new Response(HAZARD_BODIES[providerId], { status: 403, headers: { "content-type": "application/json" } });
  using server = scriptedResponses([hazard]);
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, { task: "chat", providerId, model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
  const settled = await settledProviderError(() =>
    root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      signal: new AbortController().signal,
      params: {},
      systemPrompt: { static: "You are a fixture.", dynamic: "" },
      history: [USER_LINE],
    }),
  );
  const message = settled.error?.message ?? "";
  for (const word of ESCAPED_HAZARD_WORDS.visible) {
    expect(message).toContain(word);
  }
  expect(message).not.toMatch(/[<>]/u);
  expect(message).not.toMatch(/\p{Cc}/u);
  expect(message).not.toMatch(/\p{Bidi_Control}/u);
  expect(message).not.toContain(ESCAPED_HAZARD_WORDS.keyTail);
});

test("a NanoGPT 429 is retried before anything streams, and a limit that holds fails the turn as rate_limit", async () => {
  const recorded: RecordedRequest[] = [];
  const timer = observeRuntimeTimers();
  const limited = errorReply(
    429,
    { error: { message: "Rate limit exceeded", type: "rate_limit_error", code: "api_key_rpd_limit" } },
    { ["retry-after"]: String(RETRY_AFTER_SECONDS) },
  );
  using server = scriptedResponses(
    Array.from({ length: RETRY_ATTEMPTS }, () => limited),
    recorded,
  );
  await using root = await createRuntimeRoot({ providerFetch: server.execute, timers: timer.timers });
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: "nanogpt",
    model: "vendor/chat-model",
    capability: EFFORT_CAPABILITY,
    declaredFeatures: { requestTimeoutMs: REQUEST_TIMEOUT_MS },
  });
  const cancel = new AbortController();
  const outcome = settledProviderError(() =>
    root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      params: {},
      systemPrompt: { static: "You are a fixture.", dynamic: "" },
      history: [USER_LINE],
      signal: cancel.signal,
    }),
  );
  await using _retryRequest = {
    async [Symbol.asyncDispose](): Promise<void> {
      cancel.abort();
      await outcome;
    },
  };
  for (let sent = 1; sent < RETRY_ATTEMPTS; sent += 1) {
    const backoff = await Promise.race([
      timer.next((window) => recorded.length === sent && window.ms !== REQUEST_TIMEOUT_MS, cancel.signal),
      outcome.then((): never => {
        throw new Error("the rate-limited turn settled before requesting its retry window");
      }),
    ]);
    backoff.fire();
  }
  const settled = await outcome;
  expect(settled.error?.kind).toBe("rate_limit");
  expect(recorded).toHaveLength(RETRY_ATTEMPTS);
});

// NanoGPT's Rate Limits page: a limit 429 carries `Retry-After` in seconds; its Request Billing page: "`Retry-After`
// may contain seconds or an HTTP date". The retry waits that long, not the exponential backoff.
const RETRY_AFTER_DATE_SECONDS = 3;
const RETRY_AFTER_FORMS: readonly { readonly form: string; readonly header: string; readonly waitMs: number }[] = [
  { form: "seconds", header: String(RETRY_AFTER_SECONDS), waitMs: RETRY_AFTER_SECONDS * MS_PER_SECOND },
  {
    form: "an HTTP date",
    header: new Date(FROZEN_AT_MS + RETRY_AFTER_DATE_SECONDS * MS_PER_SECOND).toUTCString(),
    waitMs: RETRY_AFTER_DATE_SECONDS * MS_PER_SECOND,
  },
];

test.for(RETRY_AFTER_FORMS)("a NanoGPT 429 whose Retry-After is $form schedules its retry then, and the retry streams", async ({ header, waitMs }) => {
  const recorded: RecordedRequest[] = [];
  const timer = observeRuntimeTimers();
  const limited = errorReply(
    429,
    { error: { message: "Rate limit exceeded", type: "rate_limit_error", code: "api_key_rpd_limit" } },
    { ["retry-after"]: header },
  );
  using server = scriptedResponses([limited, (): Response => streamOf([{ role: "assistant", content: "Hi" }])], recorded);
  await using root = await createRuntimeRoot({ providerFetch: server.execute, timers: timer.timers });
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: "nanogpt",
    model: "vendor/chat-model",
    capability: EFFORT_CAPABILITY,
    declaredFeatures: { requestTimeoutMs: REQUEST_TIMEOUT_MS },
  });
  const cancel = new AbortController();
  const outcome = root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection,
    params: {},
    systemPrompt: { static: "You are a fixture.", dynamic: "" },
    history: [USER_LINE],
    signal: cancel.signal,
  });
  await using _retryRequest = {
    async [Symbol.asyncDispose](): Promise<void> {
      cancel.abort();
      await outcome.catch(() => undefined);
    },
  };
  const wait = await timer.next((window) => recorded.length === 1 && window.ms !== REQUEST_TIMEOUT_MS, cancel.signal);
  expect(wait.ms).toBe(waitMs);
  wait.fire();
  expect((await outcome).reply).toBe("Hi");
  expect(recorded).toHaveLength(2);
});

type TurnParams = Parameters<Awaited<ReturnType<typeof createRuntimeRoot>>["app"]["runtime"]["executor"]["runChatTurn"]>[0]["params"];

/** A sampler the user set, with the value the request should carry when the provider takes it. */
type SetSampler = { readonly [K in SamplerKnob]?: NonNullable<TurnParams[K & keyof TurnParams]> };

/** The key a sampler rides under on this row: its own spelling, else the shared one. */
function wireKey(providerId: HostedRow, knob: SamplerKnob): string {
  const row = BUILTIN_PROVIDERS.find((provider) => provider.id === providerId);
  return row?.features?.samplerKeys?.[knob] ?? DEFAULT_SAMPLER_KEYS[knob];
}

interface SamplerTurn {
  readonly body: Record<string, unknown>;
  readonly dropped: readonly (string | undefined)[];
}

/** A turn on a saved connection with nothing declared, so the samplers it carries are the ones the row and its list
 *  state. The list read answers `listed`; the chat route answers one short stream. */
async function samplerTurn(providerId: HostedRow, listed: Record<string, unknown>, params: SetSampler): Promise<SamplerTurn> {
  const bodies: Record<string, unknown>[] = [];
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      return new URL(request.url).pathname.endsWith("/models")
        ? Response.json({ object: "list", data: [listed] })
        : Response.json({ object: "list", data: [] });
    }
    bodies.push(z.record(z.string(), z.unknown()).parse(await request.json()));
    return streamOf([{ role: "assistant", content: "Hi" }]);
  };
  await using root = await createRuntimeRoot({ providerFetch });
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: providerId, key: RUNTIME_KEY });
  const model = String(listed["id"]);
  const row = await root.services.connection.create({ principal, providerId, credentialId: credential.id, baseUrl: null, model });
  const signal = new AbortController().signal;
  await root.services.connection.capabilities({ principal, connectionId: row.id, signal });
  const { resolved } = await root.app.runtime.resolve({ signal, principal, task: "chat", connectionId: row.id, cachedFacts: true });
  const turn = await root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection: { ...resolved, task: "chat" },
    signal,
    params,
    systemPrompt: { static: "You are a fixture.", dynamic: "" },
    history: [USER_LINE],
  });
  const [body] = bodies;
  if (body === undefined) {
    throw new Error("the turn sent no request");
  }
  return { body, dropped: turn.events.flatMap((event) => (event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped ? [event.knob] : [])) };
}

function sentSamplers(providerId: HostedRow, turn: SamplerTurn, set: SetSampler): Record<string, unknown> {
  return Object.fromEntries(SAMPLER_KNOBS.filter((knob) => set[knob] !== undefined).map((knob) => [knob, turn.body[wireKey(providerId, knob)]]));
}

// Every sampler NanoGPT's chat-completion page names, each inside its stated span.
const NANOGPT_SAMPLERS: SetSampler = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  topA: 0.2,
  minP: 0.05,
  typicalP: 0.95,
  mirostatMode: 2,
  mirostatTau: 5,
  mirostatEta: 0.1,
  frequencyPenalty: 0.3,
  presencePenalty: 0.1,
  repetitionPenalty: 1.1,
  banEos: true,
  seed: 42,
  stop: ["###"],
};
// A local-server sampler NanoGPT's page does not name.
const UNNAMED_SAMPLER: SetSampler = { xtcProbability: 0.5 };

test("a NanoGPT turn sends every sampler its docs name with the user's value, and leaves out and reports one they do not", async () => {
  const turn = await samplerTurn("nanogpt", { id: "vendor/routed-model", object: "model" }, { ...NANOGPT_SAMPLERS, ...UNNAMED_SAMPLER });
  expect(sentSamplers("nanogpt", turn, NANOGPT_SAMPLERS)).toEqual(NANOGPT_SAMPLERS);
  expect(turn.body[wireKey("nanogpt", "xtcProbability")]).toBeUndefined();
  expect(turn.dropped).toEqual(["xtcProbability"]);
});

const LITEROUTER_ROW = { id: "lr/routed-model", object: "model", type: "chat", variant: "full-context", ["context_window"]: 131_072 };

test("a LiteRouter turn on a model its list leaves undescribed sends temperature, and leaves out and reports top_p", async () => {
  const set: SetSampler = { temperature: 0.7, topP: 0.9 };
  const turn = await samplerTurn("literouter", LITEROUTER_ROW, set);
  expect(turn.body[wireKey("literouter", "temperature")]).toBe(0.7);
  expect(turn.body[wireKey("literouter", "topP")]).toBeUndefined();
  expect(turn.dropped).toEqual(["topP"]);
});

test("a LiteRouter turn on a model its list describes sends the samplers the list names in place of the row's", async () => {
  const set: SetSampler = { temperature: 0.7, topP: 0.9, minP: 0.05, repetitionPenalty: 1.1 };
  const listed = { ...LITEROUTER_ROW, ["supported_parameters"]: ["max_tokens", "temperature", "top_p", "min_p"] };
  const turn = await samplerTurn("literouter", listed, set);
  expect(sentSamplers("literouter", turn, { temperature: 0.7, topP: 0.9, minP: 0.05 })).toEqual({ temperature: 0.7, topP: 0.9, minP: 0.05 });
  expect(turn.dropped).toEqual(["repetitionPenalty"]);
});
