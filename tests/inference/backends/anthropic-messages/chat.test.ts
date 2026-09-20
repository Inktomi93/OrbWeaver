// backends/anthropic-messages/chat — the DIRECT Anthropic wire's turn. The load-bearing pin is the two-leg
// THINKING + TOOL loop (audit A1): leg 1 streams a `thinking` block with its signature and a `tool_use`; the
// engine replays that reasoning on leg 2, and the assertion is on the WIRE BODY the converter produced — a
// real `{"type":"thinking", thinking, signature}` block ahead of the tool call. Dropping the signature is how
// a thinking+tool loop loses its verified reasoning (and, on the arms that enforce it, 400s).
//
// Also pinned here: the A2 prefill belt (a trailing assistant row on a model whose capability refuses prefill
// is a typed refusal, never a silent send), the A3 SDK-warning surfacing, and B2's applied/dropped receipt.
//
// The RECORD-TRUTH pins (audit A5 · A8/B1 · B6 · B7): a MANDATORY cell clamps an effort `none` UP and the body
// carries `thinking: adaptive` + the low effort, recorded as `appliedEffort: "low"`; a non-mandatory adaptive
// cell turns thinking OFF and records `"none"`; a classifier block (finish `refusal` + `stop_details`) becomes
// the existing `refusal` event beside the `filter` finish; the Anthropic rate-limit headers become
// `rateLimit`, and the `msg_…` id is the row's `generationId`.

import type { GenerationCapability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { runAnthropicChatTurn } from "../../../../packages/inference/src/backends/anthropic-messages/chat.ts";
import type { AnthropicChatRequest, ChatResult } from "../../../../packages/inference/src/contract/chat.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest, SseEvent } from "../_hosted-support.ts";
import {
  anthropicRedactedStream,
  anthropicRefusalStream,
  anthropicTextStream,
  anthropicThinkingToolStream,
  generationCapability,
  scriptedSseFetch,
} from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const THINKING = "The user wants Paris weather; call the tool.";
const SIGNATURE = "ErcDCpkBCBIYAipASIGNATURE";

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

function turnRequest(overrides: Partial<AnthropicChatRequest> = {}): AnthropicChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-4-5-20251101",
    capability: generationCapability(),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
  const params: UserIntent = { effort: "high" };
  return {
    api: "anthropic-messages",
    connection,
    params,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
    ...overrides,
  } as AnthropicChatRequest;
}

function deps(fetchImpl: typeof fetch, lines: LogLine[] = []): Parameters<typeof runAnthropicChatTurn>[1] {
  return { now: () => NOW, log: recordingLog(lines), transport: { fetch: fetchImpl } };
}

function assistantRowOf(recorded: RecordedRequest): Record<string, unknown> {
  const messages = recorded.body["messages"];
  const row = Array.isArray(messages) ? messages.find((m: unknown) => (m as { role?: string }).role === "assistant") : undefined;
  return (row ?? {}) as Record<string, unknown>;
}

test("a thinking + tool loop replays the reasoning block WITH its signature on the second leg", async () => {
  const recorded: RecordedRequest[] = [];
  const streams: SseEvent[][] = [anthropicThinkingToolStream({ thinking: THINKING, signature: SIGNATURE }), anthropicTextStream("18C and clear.")];
  const fetchImpl = scriptedSseFetch(streams, recorded);

  const leg1 = await runAnthropicChatTurn(turnRequest(), deps(fetchImpl));
  expect(leg1.reasoning).toBe(THINKING);
  expect(leg1.toolCalls?.[0]?.name).toBe("get_weather");
  // The captured reasoning parts are what the engine persists and replays (the record lane stores them).
  expect(leg1.reasoningParts).toHaveLength(1);
  expect(leg1.reasoningParts?.[0]).toMatchObject({ type: "reasoning", text: THINKING, meta: { anthropic: { signature: SIGNATURE } } });

  const leg2 = turnRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] },
      {
        role: "assistant",
        content: [...(leg1.reasoningParts ?? []), { type: "tool-call", toolCallId: "toolu_1", name: "get_weather", arguments: '{"city":"Paris"}' }],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "toolu_1", content: "18C, clear." }] },
    ],
  });
  await runAnthropicChatTurn(leg2, deps(fetchImpl));

  const second = recorded[1];
  expect(second).toBeDefined();
  const blocks = assistantRowOf(second as RecordedRequest)["content"];
  expect(Array.isArray(blocks)).toBe(true);
  expect(blocks).toMatchObject([
    { type: "thinking", thinking: THINKING, signature: SIGNATURE },
    { type: "tool_use", name: "get_weather" },
  ]);
});

test("a redacted thinking block rides back as opaque data, and IS what marks the turn redacted", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicRedactedStream("REDACTED-PAYLOAD")], recorded);
  const turn = await runAnthropicChatTurn(turnRequest(), deps(fetchImpl));
  expect(turn.reasoningRedacted).toBe(true);
  expect(turn.reasoningParts?.[0]).toMatchObject({ type: "reasoning", text: "", meta: { anthropic: { redactedData: "REDACTED-PAYLOAD" } } });
});

test("a turn with no reasoning at all is not reported as redacted", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("plain")], recorded);
  const turn = await runAnthropicChatTurn(turnRequest(), deps(fetchImpl));
  expect(turn.reasoningRedacted).toBe(false);
  expect(turn.reasoningParts ?? []).toHaveLength(0);
});

test("A2 belt: a delivered trailing assistant row on a model that refuses prefill is a typed refusal", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("never sent")], recorded);
  const req = turnRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "Continue:" }] },
      { role: "assistant", content: [{ type: "text", text: "Once upon a" }] },
    ],
    tools: undefined,
  });
  const err = await runAnthropicChatTurn(req, deps(fetchImpl)).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "invalid", retryable: false });
  expect(recorded).toHaveLength(0);
});

test("A3/B2: an SDK-dropped sampler knob becomes a warning event and leaves the applied receipt", async () => {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("ok")], recorded);
  const req = turnRequest({ params: { effort: "high", temperature: 0.5, frequencyPenalty: 0.5 } as UserIntent, tools: undefined });
  const turn = await runAnthropicChatTurn(req, deps(fetchImpl, lines));
  const codes = turn.events.flatMap((e) => (e.kind === "warning" ? [e.code] : []));
  expect(codes).toContain("sdk_unsupported_setting");
  const sampling = lines.find((line) => line.fields["event"] === "provider.sampling");
  expect(sampling).toBeDefined();
  const applied = sampling?.fields["applied"] as Record<string, unknown>;
  const dropped = sampling?.fields["dropped"] as { knob: string }[];
  expect(applied["frequencyPenalty"]).toBeUndefined();
  expect(dropped.map((d) => d.knob)).toContain("frequencyPenalty");
});

// ── the record-truth pins (audit A5 · A8/B1 · B6 · B7) ───────────────────────────────────────────────────

const RESET = "2026-09-20T06:04:11Z";
/** The direct wire's own header set (measured 2026-09-20, `req_011CfEBkpjRWAjtLDifB2qpW`; remaining lowered to pick an axis). */
const RATE_HEADERS = {
  "anthropic-ratelimit-requests-limit": "5000",
  "anthropic-ratelimit-requests-remaining": "4999",
  "anthropic-ratelimit-requests-reset": RESET,
  "anthropic-ratelimit-tokens-limit": "6000000",
  "anthropic-ratelimit-tokens-remaining": "1500000",
  "anthropic-ratelimit-tokens-reset": RESET,
  "request-id": "req_test",
};

const ADAPTIVE_REASONING: GenerationCapability["reasoning"] = { mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] };

/** A Fable-shaped request: effort `none` on an adaptive cell, mandatory or not. */
function fableRequest(mandatory: boolean): AnthropicChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-fable-5-1",
    capability: generationCapability({ reasoning: mandatory ? { ...ADAPTIVE_REASONING, mandatory: true } : ADAPTIVE_REASONING }),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
  return turnRequest({ connection, params: { effort: "none" } as UserIntent, tools: undefined });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function thinkingTypeOf(recorded: RecordedRequest | undefined): unknown {
  const thinking = recorded?.body["thinking"];
  return isRecord(thinking) ? thinking["type"] : undefined;
}

async function recordedTurn(
  req: AnthropicChatRequest,
  stream: SseEvent[],
  headers: Readonly<Record<string, string>> = {},
): Promise<{ turn: ChatResult; body: RecordedRequest | undefined }> {
  const recorded: RecordedRequest[] = [];
  const turn = await runAnthropicChatTurn(req, deps(scriptedSseFetch([stream], recorded, headers)));
  return { turn, body: recorded[0] };
}

test("A8/B1: a MANDATORY cell clamps effort `none` up — the body carries adaptive thinking and the record says the wire's `low`", async () => {
  const { turn, body } = await recordedTurn(fableRequest(true), anthropicTextStream("ok"));
  expect(thinkingTypeOf(body)).toBe("adaptive");
  expect(JSON.stringify(body?.body)).toContain('"effort":"low"');
  expect(turn.appliedEffort).toBe("low");
  expect(turn.events.flatMap((e) => (e.kind === "warning" ? [e.code] : []))).toContain("reasoning_mandatory_clamp");
  expect(turn.reply).toBe("ok");
});

test("B1 (control): a non-mandatory adaptive cell turns thinking OFF for effort `none` — the body says disabled, the record says `none`", async () => {
  const { turn, body } = await recordedTurn(fableRequest(false), anthropicTextStream("ok"));
  expect(thinkingTypeOf(body)).toBe("disabled");
  expect(turn.appliedEffort).toBe("none");
});

test("B6 + B7: the Anthropic rate-limit headers become the snapshot (tightest axis = tokens) and the msg_ id is the generationId", async () => {
  const { turn } = await recordedTurn(fableRequest(true), anthropicTextStream("ok"), RATE_HEADERS);
  expect(turn.rateLimit).toMatchObject({ status: "allowed", rateLimitType: "tokens", resetsAt: Date.parse(RESET) });
  expect(turn.rateLimit?.utilization).toBeCloseTo(0.75);
  expect(turn.generationId).toBe("msg_leg2");
  expect(turn.usage).toMatchObject({ tokensIn: 10, costProvenance: "unrecorded" });
  // PLANTED CONTROL: a response without the family leaves the snapshot null.
  const bare = await recordedTurn(fableRequest(true), anthropicTextStream("ok"));
  expect(bare.turn.rateLimit).toBeNull();
});

test("A5: a classifier block is a `filter` finish with the refusal event carrying the category and explanation", async () => {
  const { turn } = await recordedTurn(fableRequest(true), anthropicRefusalStream({ category: "cyber", explanation: "blocked under the Usage Policy" }));
  expect(turn.finishReason).toBe("filter");
  expect(turn.stopReason).toBe("refusal");
  const refusal = turn.events.find((e) => e.kind === "refusal");
  expect(refusal).toMatchObject({
    kind: "refusal",
    model: "claude-fable-5-1",
    category: "cyber",
    explanation: "blocked under the Usage Policy",
    retried: false,
    fallbackModel: null,
  });
  // PLANTED CONTROL: a plain end_turn carries no refusal event.
  const plain = await recordedTurn(fableRequest(true), anthropicTextStream("ok"));
  expect(plain.turn.events.some((e) => e.kind === "refusal")).toBe(false);
});

// ── §8.8 the `conversation` rung's ROW SHAPE, against the real converter ─────────────────────────────────
// The assembly materializes a PRIOR TURN's thinking onto its assistant history row ahead of the body
// (`substrate/wire-history.ts`, pinned at that seam). This is the other half of that claim: the bytes the
// Anthropic converter actually produces from that row — a `thinking` block with its signature FIRST, then
// the prose — because a spec type permitting a shape is not a converter emitting it (§15c-1).

test("a prior turn's replayed thinking converts to a leading `thinking` block ahead of the row's prose", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("Understood.")], recorded);
  const req = turnRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "Is the map genuine?" }] },
      // EXACTLY what `buildWireHistory` emits on the `conversation` rung: thinking first, then the body.
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: THINKING, meta: { anthropic: { signature: SIGNATURE } } },
          { type: "text", text: "The map is genuine." },
        ],
      },
      { role: "user", content: [{ type: "text", text: "Are you sure?" }] },
    ],
    tools: undefined,
  });
  await runAnthropicChatTurn(req, deps(fetchImpl));

  const blocks = assistantRowOf(recorded[0] as RecordedRequest)["content"];
  expect(blocks).toMatchObject([
    { type: "thinking", thinking: THINKING, signature: SIGNATURE },
    { type: "text", text: "The map is genuine." },
  ]);
});

test("PLANTED CONTROL: the same row WITHOUT the carry sends prose only — no thinking block at all", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("Understood.")], recorded);
  const req = turnRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "Is the map genuine?" }] },
      { role: "assistant", content: [{ type: "text", text: "The map is genuine." }] },
      { role: "user", content: [{ type: "text", text: "Are you sure?" }] },
    ],
    tools: undefined,
  });
  await runAnthropicChatTurn(req, deps(fetchImpl));

  const blocks = assistantRowOf(recorded[0] as RecordedRequest)["content"];
  expect(blocks).toMatchObject([{ type: "text", text: "The map is genuine." }]);
});

// ── the TOOL doors, against the real converter (audit C1 + C4) ───────────────────────────────────────────
// §15c-1: a spec type permitting a shape is not a converter emitting it. `LanguageModelV4FunctionTool` has
// carried `strict`, `inputExamples` and per-tool `providerOptions` all along; what these pin is that the
// 4.0.58 Anthropic converter turns ours into `strict` / `input_examples` / `cache_control` on the WIRE.

function toolsOf(recorded: RecordedRequest | undefined): readonly Record<string, unknown>[] {
  const tools = recorded?.body["tools"];
  return Array.isArray(tools) ? (tools as readonly Record<string, unknown>[]) : [];
}

test("C4: `cacheControl` rides the LAST tool alone, and the cache receipt counts that breakpoint", async () => {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  const req = turnRequest({
    tools: [
      { name: "tick_clock", description: "d", parameters: { type: "object" } },
      { name: "roll_dice", description: "d", parameters: { type: "object" } },
    ],
  });
  await runAnthropicChatTurn(req, deps(scriptedSseFetch([anthropicTextStream("ok")], recorded), lines));

  const tools = toolsOf(recorded[0]);
  expect(tools).toHaveLength(2);
  // The tool list is one cacheable prefix: Anthropic caches UP TO a breakpoint, so the marker belongs on the
  // last entry and on nothing else. A marker per tool would spend the whole per-request breakpoint budget.
  expect(tools[0]?.["cache_control"]).toBeUndefined();
  expect(tools[1]?.["cache_control"]).toMatchObject({ type: "ephemeral", ttl: "1h" });
  // A breakpoint the receipt does not count is a cache write nobody can audit.
  const cache = lines.find((line) => line.fields["event"] === "provider.cache");
  expect(cache?.fields["breakpointsPlaced"]).toBe(2); // the static system block + the tool list
});

test("C4 control: a tool-less turn places no tool breakpoint and the count drops back", async () => {
  const lines: LogLine[] = [];
  await runAnthropicChatTurn(turnRequest({ tools: undefined }), deps(scriptedSseFetch([anthropicTextStream("ok")], []), lines));

  expect(lines.find((line) => line.fields["event"] === "provider.cache")?.fields["breakpointsPlaced"]).toBe(1);
});

test("C1: a tool's `strict` and `inputExamples` reach the wire as `strict` / `input_examples`", async () => {
  const recorded: RecordedRequest[] = [];
  const req = turnRequest({
    tools: [{ name: "tick_clock", description: "d", parameters: { type: "object" }, strict: true, inputExamples: [{ minutes: 30 }] }],
  });
  await runAnthropicChatTurn(req, deps(scriptedSseFetch([anthropicTextStream("ok")], recorded)));

  expect(toolsOf(recorded[0])[0]).toMatchObject({ name: "tick_clock", strict: true, input_examples: [{ minutes: 30 }] });
});

// ── D4: the turn's span events ───────────────────────────────────────────────────────────────────────────
test("D4: the turn emits first-delta, finish and cache events — the three a span's duration cannot answer", async () => {
  const events: { name: string; attrs: Record<string, string | number | boolean> }[] = [];
  const addSpanEvent = (name: string, attrs: Readonly<Record<string, string | number | boolean>>): void => {
    events.push({ name, attrs: { ...attrs } });
  };
  const base = deps(scriptedSseFetch([anthropicTextStream("ok")], []));
  await runAnthropicChatTurn(turnRequest({ tools: undefined }), { ...base, addSpanEvent });

  const names = events.map((e) => e.name);
  expect(names).toContain("provider.first_delta");
  expect(names).toContain("provider.finish");
  expect(names).toContain("provider.cache");
  // The finish carries the NORMALIZED member (anything may branch on it) beside the raw upstream word.
  expect(events.find((e) => e.name === "provider.finish")?.attrs).toMatchObject({ finishReason: "stop", stopReason: "end_turn" });
});
