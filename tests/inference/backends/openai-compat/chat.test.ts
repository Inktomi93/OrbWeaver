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

import type { EFFORT_SPELLINGS } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { JsonValue } from "@orb/kit/json";
import { runOpenAiCompatChatTurn } from "../../../../packages/inference/src/backends/openai-compat/chat.ts";
import type { ChatResult, OpenAiCompatChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
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

function orRequest(overrides: Partial<OpenAiCompatChatRequest> = {}): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const base: OpenAiCompatChatRequest = {
    api: "chat-completions",
    connection,
    params: { effort: "high" } satisfies UserIntent,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  };
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

test("C3: `web_search_options` rides when declared, and the body carries nothing when it is not", async () => {
  const withOptions = await sentBody(orRequest({ tools: undefined, connection: extrasConnection({ web_search_options: { max_results: 5, engine: "exa" } }) }));
  expect(withOptions["web_search_options"]).toMatchObject({ max_results: 5, engine: "exa" });

  const without = await sentBody(orRequest({ tools: undefined }));
  expect(without["web_search_options"]).toBeUndefined();
});
