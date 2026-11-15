// @subject packages/contracts/src/inference/builtin-providers.ts
// The hosted OpenAI-compatible rows chat with only a key: each stream ends with its usage, NanoGPT carries the
// chosen effort out and its reasoning back, and each service's own error bodies reach a named failure.
import type { ChatDeltaEvent } from "@orb/contracts/chat";
import type { ProviderErrorKind } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import { seedRecallRoom } from "@orb/testkit/node/composed";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { settledProviderError } from "../conformance/runtime.fixtures.ts";
import type { SseEvent } from "../conformance/transport.fixtures.ts";
import { eventResponse, scriptedResponses } from "../conformance/transport.fixtures.ts";
import { createRuntimeRoot, generationCapability, observeRuntimeTimers, RUNTIME_KEY, wireConnection } from "./runtime.fixtures.ts";

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

// Error bodies as each service answers them: NanoGPT's nested object (live 401), its older bare-string 402, and
// LiteRouter's bare string (live 401).
const REFUSALS: readonly {
  readonly providerId: HostedRow;
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly kind: ProviderErrorKind;
}[] = [
  {
    providerId: "nanogpt",
    status: 401,
    body: { error: { message: "Invalid Authentication", type: "invalid_request_error", code: "missing_api_key", status: 401 } },
    kind: "auth_failed",
  },
  { providerId: "nanogpt", status: 402, body: { error: "Insufficient balance", requiredBalance: 0.0035, status: 402 }, kind: "billing" },
  { providerId: "literouter", status: 401, body: { error: "[LiteRouter] Invalid or missing API key" }, kind: "auth_failed" },
];

test.for(REFUSALS)("a $providerId $status answer fails the turn as $kind without a retry", async ({ providerId, status, body, kind }) => {
  const recorded: RecordedRequest[] = [];
  const settled = await settledProviderError(async () => {
    using server = scriptedResponses([errorReply(status, body)], recorded);
    await using root = await createRuntimeRoot({ providerFetch: server.execute });
    const connection = await wireConnection(root, { task: "chat", providerId, model: "vendor/chat-model", capability: EFFORT_CAPABILITY });
    return await root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      params: {},
      systemPrompt: { static: "You are a fixture.", dynamic: "" },
      history: [USER_LINE],
    });
  });
  expect(settled.error?.kind).toBe(kind);
  expect(recorded).toHaveLength(1);
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
