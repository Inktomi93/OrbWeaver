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

import type { EFFORT_SPELLINGS, ProviderId } from "@orb/contracts/inference";
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
import { openRouterCatalogFetch } from "../../_openrouter-catalog.ts";
import { fakeApiKeySecret, fakeConnection, fakeDeps, fakeResolved, memoryStores, newUserId } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, openRouterReasoningToolStream, scriptedSseFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const REASONING = "Paris weather needs the tool.";
const SIGNATURE = "sig-anthropic-claude-v1";

const APP = { name: "orbweaver-test", url: "http://localhost:0" };

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

function turnDeps(fetchImpl: typeof fetch): Parameters<typeof runOpenAiCompatChatTurn>[1] {
  return { now: () => NOW, log: silentLog(), transport: { fetch: fetchImpl, app: APP } };
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

  // `effort: "none"` is what makes the turn REPLAYABLE: `drainWithReplay`'s second argument is
  // `dialect === "openrouter" && !knobs.reasoning.enabled`.
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
