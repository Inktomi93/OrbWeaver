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

import type { GenerationCapability, PromptCacheSettings, ProviderId } from "@orb/contracts/inference";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { castId } from "@orb/kit/ids";
import { runAnthropicChatTurn } from "../../../../packages/inference/src/backends/anthropic-messages/chat.ts";
import { anthropicUserIdDigest } from "../../../../packages/inference/src/backends/anthropic-messages/extras.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { AnthropicChatRequest, ChatDeltaSubscription, ChatResult } from "../../../../packages/inference/src/contract/chat.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved, newUserId } from "../../_support.ts";
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

type AnthropicRequestOverrides = Partial<Omit<AnthropicChatRequest, "chatId" | "onDelta">> & ChatDeltaSubscription;

function turnRequest(overrides: AnthropicRequestOverrides = {}): AnthropicChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-4-5-20251101",
    capability: generationCapability(),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
  const params: UserIntent = { effort: "high" };
  const base = {
    api: "anthropic-messages",
    connection,
    params,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  } satisfies AnthropicChatRequest;
  return { ...base, ...overrides };
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
  const req = turnRequest({ params: { effort: "high", temperature: 0.5, frequencyPenalty: 0.5 }, tools: undefined });
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
  return turnRequest({ connection, params: { effort: "none" }, tools: undefined });
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

/** A direct-wire connection whose capability is the REAL curated fold for `model` (the rows `resolve-task.ts`
 *  folds for an `anthropic` connection), so the pin exercises the data the wire reads in production. */
function curatedConnection(model: string): AnthropicChatRequest["connection"] {
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" }),
  });
  return fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model,
    capability,
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
}

function eventCodes(turn: ChatResult): readonly string[] {
  return turn.events.flatMap((e) => (e.kind === "warning" ? [e.code] : []));
}

// The preset's parallel-tool switch turned OFF (`false`) disables parallel tool use; unset leaves the default.
test("parallelToolCalls false sends disable_parallel_tool_use; unset sends none", async () => {
  const off = await recordedTurn(turnRequest({ params: { effort: "high", advanced: { parallelToolCalls: false } } }), anthropicTextStream("ok"));
  expect(off.body?.body["tool_choice"]).toMatchObject({ type: "auto", disable_parallel_tool_use: true });
  const unset = await recordedTurn(turnRequest({ params: { effort: "high" } }), anthropicTextStream("ok"));
  expect(JSON.stringify(unset.body?.body ?? {})).not.toContain("disable_parallel_tool_use");
});

// #2575: Fable 5.1, Mythos 5.1 and Opus 5.5 answer a forced `tool_choice` (`any` / `tool`) with a 400
// ("tool_choice: type "tool" and "any" are not supported for this model"). The rpg state round sends
// `required`; on those models the wire must send `auto` instead and SAY so, never the request that 400s.
const FORCED_CHOICES = [{ mode: "required" }, { mode: "tool", name: "get_weather" }] as const;

test("#2575: a forced tool_choice on a model that rejects it goes out as `auto`, loudly", async () => {
  for (const model of ["claude-fable-5-1", "claude-mythos-5-1", "claude-opus-5-5"]) {
    for (const toolChoice of FORCED_CHOICES) {
      const { turn, body } = await recordedTurn(turnRequest({ connection: curatedConnection(model), toolChoice }), anthropicTextStream("ok"));
      expect(body?.body["tool_choice"], `${model} · ${toolChoice.mode}`).toMatchObject({ type: "auto" });
      // The tools themselves still ride — only the forcing is withdrawn.
      expect(body?.body["tools"], model).toMatchObject([{ name: "get_weather" }]);
      expect(eventCodes(turn), `${model} · ${toolChoice.mode}`).toContain("tool_choice_downgraded");
    }
  }
});

test("#2575 (control): the models that accept a forced tool_choice keep it byte-for-byte", async () => {
  for (const model of ["claude-opus-5", "claude-fable-5"]) {
    const required = await recordedTurn(turnRequest({ connection: curatedConnection(model), toolChoice: { mode: "required" } }), anthropicTextStream("ok"));
    expect(required.body?.body["tool_choice"], model).toMatchObject({ type: "any" });
    expect(eventCodes(required.turn), model).not.toContain("tool_choice_downgraded");
    const named = await recordedTurn(turnRequest({ connection: curatedConnection(model), toolChoice: FORCED_CHOICES[1] }), anthropicTextStream("ok"));
    expect(named.body?.body["tool_choice"], model).toMatchObject({ type: "tool", name: "get_weather" });
  }
});

test("#2575: Opus 5.5 with reasoning OFF never sends `thinking: disabled` — it is clamped to the lowest effort", async () => {
  const { turn, body } = await recordedTurn(
    turnRequest({ connection: curatedConnection("claude-opus-5-5"), params: { effort: "none" }, tools: undefined }),
    anthropicTextStream("ok"),
  );
  expect(thinkingTypeOf(body)).toBe("adaptive");
  expect(body?.body["output_config"]).toMatchObject({ effort: "low" });
  expect(turn.appliedEffort).toBe("low");
  expect(eventCodes(turn)).toContain("reasoning_mandatory_clamp");
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

// ── E1/§15c: the wire-capture BYTE-EQUALITY pin — a caret bump of `@ai-sdk/anthropic` that reshapes ANY
// field of the converted request (renames a key, drops a default, restructures `thinking`) fails this
// test, where every other pin in this file only checks the fields it names. `owner` is minted per-run so
// the abuse-attribution digest is computed from the SAME production function (`anthropicUserIdDigest`)
// rather than hand-copied — a change to the digest's domain string or algorithm still fails here.
test("byte-equality: the FULL request body for a minimal deterministic turn — a caret SDK bump fails visibly", async () => {
  const owner = newUserId();
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-4-5-20251101",
    capability: generationCapability(),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
    ownerId: owner,
  });
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("ok")], recorded);
  await runAnthropicChatTurn(turnRequest({ connection, tools: undefined }), deps(fetchImpl));
  expect(recorded[0]?.body).toEqual({
    model: "claude-opus-4-5-20251101",
    max_tokens: 64_000,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "high" },
    metadata: { user_id: anthropicUserIdDigest(owner) },
    system: [{ type: "text", text: "You are a helpful assistant.", cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    stream: true,
  });
});

// The per-turn system half sits in the system region, where the prompt order put it, on every model: a model
// that takes mid-conversation system rows (opus-5) and one that refuses them (haiku-4-5) get the same `system[]`,
// and neither moves the half below the history. The static block keeps the cache marker.
test("the per-turn system half stays in system[] on a mid-conversation-system model and an older model alike", async () => {
  for (const model of ["claude-opus-5", "claude-haiku-4-5"]) {
    const { body } = await recordedTurn(
      turnRequest({ connection: curatedConnection(model), tools: undefined, systemPrompt: { static: "STATIC", dynamic: "DYNAMIC" } }),
      anthropicTextStream("ok"),
    );
    expect(body?.body["system"], model).toEqual([
      { type: "text", text: "STATIC", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "DYNAMIC" },
    ]);
    expect(JSON.stringify(body?.body["messages"]), model).not.toContain("DYNAMIC");
  }
});

// ── preserved thinking on the prefix-bound models ────────────────────────────────────────────────────────
// With `carryReasoning: "conversation"`, prior thinking rides back over a prefix the next turn can change (the
// dynamic system block, window trimming). On a prefix-bound model a stale block is a 400 for new accounts unless
// the request asks the API to drop it; the SDK spells that `block_binding` and adds its beta itself.
async function thinkingOfTurn(model: string, carryReasoning: UserIntent["carryReasoning"]): Promise<unknown> {
  const { body } = await recordedTurn(
    turnRequest({ connection: curatedConnection(model), tools: undefined, params: { effort: "high", carryReasoning } }),
    anthropicTextStream("ok"),
  );
  return body?.body["thinking"];
}

test("carry `conversation` on a prefix-bound model asks the API to drop a stale thinking block — and nowhere else", async () => {
  for (const model of ["claude-opus-5-5", "claude-fable-5-1"]) {
    expect(await thinkingOfTurn(model, "conversation"), model).toMatchObject({
      type: "adaptive",
      block_binding: { prefix_mismatch_behavior: "drop_block" },
    });
  }
  // CONTROLS: no carry on the same model, and the same carry on a model whose thinking is not prefix-bound.
  expect(await thinkingOfTurn("claude-opus-5-5", "off")).not.toHaveProperty("block_binding");
  expect(await thinkingOfTurn("claude-opus-5", "conversation")).not.toHaveProperty("block_binding");
});

// The SDK streams every function tool's input eagerly by default (`toolStreaming` defaults to true, so each tool
// carries `eager_input_streaming: true`), which skips the API's own JSON check of that input. The engine parses
// and schema-validates every call before it runs (`tool-use/verbs/execute-tool-calls.ts`, `register.ts`), so the
// default is safe; this pins the wire fact the extras header describes.
test("tool input streams eagerly on the direct wire (the SDK default the extras header documents)", async () => {
  const recorded: RecordedRequest[] = [];
  await runAnthropicChatTurn(turnRequest(), deps(scriptedSseFetch([anthropicTextStream("ok")], recorded)));
  expect(toolsOf(recorded[0]).map((tool) => tool["eager_input_streaming"])).toEqual([true]);
});

// ── the cached prefix across a group round ─────────────────────────────────────────────────────────────────
// SHAPE keeps each stored row of a same-role run its own row on this wire. The SDK must deliver them as one
// message of separate blocks, so the block the previous call marked keeps its bytes and its end when the next
// speaker's reply lands under it.

/** The prompt as the cache reads it: each system and message block in order, tagged with its turn's role, with
 *  the `cache_control` marker set aside (it is not prompt bytes) and reported as the block index it rode on. */
function cachedBlocks(recorded: RecordedRequest | undefined): { readonly blocks: readonly string[]; readonly marked: readonly number[] } {
  const body = recorded?.body ?? {};
  const turns = [{ role: "system", content: body["system"] }, ...(Array.isArray(body["messages"]) ? (body["messages"] as Record<string, unknown>[]) : [])];
  const blocks: string[] = [];
  const marked: number[] = [];
  for (const turn of turns) {
    for (const block of Array.isArray(turn["content"]) ? (turn["content"] as Record<string, unknown>[]) : []) {
      const { cache_control: marker, ...bytes } = block;
      if (marker !== undefined) {
        marked.push(blocks.length);
      }
      blocks.push(JSON.stringify([turn["role"], bytes]));
    }
  }
  return { blocks, marked };
}

test("a group round keeps the block the previous call marked: same bytes, same end, one assistant turn", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-5",
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
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
  const text = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
  const call = async (history: AnthropicChatRequest["history"]): Promise<RecordedRequest | undefined> =>
    (await recordedTurn(turnRequest({ connection, tools: undefined, cacheBreakpointDepth: 1, history }), anthropicTextStream("ok"))).body;
  const opening = [
    { role: "user", content: text("We head for the harbor.") },
    { role: "assistant", content: text("Mara: Mara leads.") },
  ] satisfies AnthropicChatRequest["history"];

  const wren = await call([...opening, { role: "user", content: text("[Write the next reply only as Wren.]") }]);
  const kai = await call([
    ...opening,
    { role: "assistant", content: text("Wren: Wren scouts.") },
    { role: "user", content: text("[Write the next reply only as Kai.]") },
  ]);

  const n = cachedBlocks(wren);
  const next = cachedBlocks(kai);
  const deepest = Math.max(...n.marked);
  // System (0) and Mara's block (2) are marked on the first call.
  expect(n.marked).toEqual([0, 2]);
  expect(next.blocks.slice(0, deepest + 1)).toEqual(n.blocks.slice(0, deepest + 1));
  // The run is still ONE assistant turn on the wire, made of two blocks, and the marker moved to the newest one.
  const messages = kai?.body["messages"] as Record<string, unknown>[];
  expect(messages.map((message) => message["role"])).toEqual(["user", "assistant", "user"]);
  expect(messages[1]?.["content"]).toEqual([
    { type: "text", text: "Mara: Mara leads." },
    { type: "text", text: "Wren: Wren scouts.", cache_control: { type: "ephemeral", ttl: "1h" } },
  ]);
});

// The SDK behavior the layout above rests on (`@ai-sdk/anthropic` groupIntoBlocks): adjacent same-role rows become
// one message, and a row's own marker stays on that row's last block even when a later row joins the message. An
// SDK bump that joins the rows or moves the marker to the message's end reds here.
test("SDK pin: adjacent same-role rows group into one message and each row's marker stays on its own last block", async () => {
  const text = (value: string): { type: "text"; text: string } => ({ type: "text", text: value });
  const { body } = await recordedTurn(
    turnRequest({
      tools: undefined,
      history: [
        { role: "user", content: [text("We head for the harbor.")] },
        { role: "assistant", content: [text("Mara: "), text("Mara leads.")], wireMeta: { cacheBreakpoint: true } },
        { role: "assistant", content: [text("Wren: Wren scouts.")] },
        { role: "user", content: [text("[Write the next reply only as Kai.]")] },
      ],
    }),
    anthropicTextStream("ok"),
  );
  const messages = body?.body["messages"] as Record<string, unknown>[];
  expect(messages.map((message) => message["role"])).toEqual(["user", "assistant", "user"]);
  expect(messages[1]?.["content"]).toEqual([
    { type: "text", text: "Mara: " },
    { type: "text", text: "Mara leads.", cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: "Wren: Wren scouts." },
  ]);
});

// ── the connection's PROMPT-CACHE settings on the direct wire ──────────────────────────────────────────────
// Each setting is pinned on the BYTES the converter produced. The walk reads every marker in Anthropic's prefix
// order — tools, then the system blocks, then the messages — because that is the order the TTL rule is stated
// in: a longer-TTL breakpoint must come before any shorter one, so a 1h marker may never follow a 5m one.

const TTL_RANK: Readonly<Record<string, number>> = { "1h": 2, "5m": 1 };

interface WireMarker {
  readonly at: string;
  readonly marker: unknown;
}

/** Every `cache_control` the body carries, in prefix order, tagged with where it rode. */
function markersInPrefixOrder(recorded: RecordedRequest | undefined): readonly WireMarker[] {
  const body = recorded?.body ?? {};
  const found: WireMarker[] = [];
  const blocksOf = (value: unknown): readonly Record<string, unknown>[] => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);
  for (const [index, tool] of blocksOf(body["tools"]).entries()) {
    if (tool["cache_control"] !== undefined) {
      found.push({ at: `tool:${String(index)}`, marker: tool["cache_control"] });
    }
  }
  for (const block of blocksOf(body["system"])) {
    if (block["cache_control"] !== undefined) {
      found.push({ at: "system", marker: block["cache_control"] });
    }
  }
  for (const [index, message] of blocksOf(body["messages"]).entries()) {
    for (const block of blocksOf(message["content"])) {
      if (block["cache_control"] !== undefined) {
        found.push({ at: `message:${String(index)}`, marker: block["cache_control"] });
      }
    }
  }
  return found;
}

/** No marker is followed by one with a LONGER ttl (the API's order rule). */
function ttlOrderHolds(markers: readonly WireMarker[]): boolean {
  const ranks = markers.map(({ marker }) => TTL_RANK[String((marker as { ttl?: unknown }).ttl)] ?? 0);
  return ranks.every((rank, index) => index === 0 || rank <= (ranks[index - 1] ?? 0));
}

/** The `anthropic-beta` entries a request carried, or none. */
function betasOf(recorded: RecordedRequest | undefined): readonly string[] {
  const header = recorded?.headers?.["anthropic-beta"];
  return header === undefined ? [] : header.split(",").map((beta) => beta.trim());
}

const CACHE_TTL_BETA = /cache-ttl/iu;

/** A direct Anthropic turn over a six-row history with two tools, cacheable at any depth (floor 1 token). */
function cacheTurn(promptCache: PromptCacheSettings, cacheBreakpointDepth = 1): AnthropicChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-5",
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
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
    promptCache,
  });
  const text = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
  return turnRequest({
    connection,
    cacheBreakpointDepth,
    tools: [
      { name: "tick_clock", description: "d", parameters: { type: "object" } },
      { name: "roll_dice", description: "d", parameters: { type: "object" } },
    ],
    history: [
      { role: "user", content: text("u0") },
      { role: "assistant", content: text("a0") },
      { role: "user", content: text("u1") },
      { role: "assistant", content: text("a1") },
      { role: "user", content: text("u2") },
      { role: "assistant", content: text("a2") },
      { role: "user", content: text("u3") },
    ],
  });
}

for (const ttl of ["5m", "1h"] as const) {
  test(`prompt cache ttl ${ttl}: every marker on the direct wire carries it, in a legal TTL order, with no cache-ttl beta`, async () => {
    const { body } = await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, ttl }), anthropicTextStream("ok"));
    const markers = markersInPrefixOrder(body);
    // The last tool, the static system block, and the history pair at depths 1 and 3 (a2 and a1).
    expect(markers.map(({ at }) => at)).toEqual(["tool:1", "system", "message:3", "message:5"]);
    for (const { marker } of markers) {
      expect(marker).toEqual({ type: "ephemeral", ttl });
    }
    expect(ttlOrderHolds(markers)).toBe(true);
    // No beta header is required for either TTL (Anthropic docs). Positive control: the matcher
    // does catch the beta the old note claimed a direct 1h needed.
    expect(betasOf(body).filter((beta) => CACHE_TTL_BETA.test(beta))).toEqual([]);
    expect(
      betasOf({ url: "", body: {}, headers: { "anthropic-beta": "a-beta, extended-cache-ttl-2025-04-11" } }).some((beta) => CACHE_TTL_BETA.test(beta)),
    ).toBe(true);
  });
}

test("the TTL order check reds on a 5m marker ahead of a 1h one (the rule the one-ttl plan exists to keep)", () => {
  const five = { type: "ephemeral", ttl: "5m" };
  const hour = { type: "ephemeral", ttl: "1h" };
  expect(
    ttlOrderHolds([
      { at: "tool:0", marker: hour },
      { at: "system", marker: five },
    ]),
  ).toBe(true);
  expect(
    ttlOrderHolds([
      { at: "tool:0", marker: five },
      { at: "system", marker: hour },
    ]),
  ).toBe(false);
});

test("prompt cache: with the system block off, the system carries no marker and the tools and history keep theirs", async () => {
  const { body } = await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, cacheSystem: false }), anthropicTextStream("ok"));
  expect(markersInPrefixOrder(body).map(({ at }) => at)).toEqual(["tool:1", "message:3", "message:5"]);
  const system = body?.body["system"] as Record<string, unknown>[];
  expect(system).toEqual([{ type: "text", text: "You are a helpful assistant." }]);
});

test("prompt cache OFF: no cache_control anywhere — not the tools, the system, the history, nor a wireMeta row", async () => {
  const lines: LogLine[] = [];
  const req = cacheTurn({ ...SHIPPED_PROMPT_CACHE, enabled: false });
  // A row the assembly flagged as a breakpoint of its own: caching off silences it too.
  const history = req.history.map((row, index) => (index === 1 ? { ...row, wireMeta: { cacheBreakpoint: true as const } } : row));
  const recorded: RecordedRequest[] = [];
  await runAnthropicChatTurn({ ...req, history }, deps(scriptedSseFetch([anthropicTextStream("ok")], recorded), lines));
  expect(markersInPrefixOrder(recorded[0])).toEqual([]);
  expect(JSON.stringify(recorded[0]?.body)).not.toContain("cache_control");
  expect(lines.find((line) => line.fields["event"] === "provider.cache")?.fields["breakpointsPlaced"]).toBe(0);
});

test("prompt cache depth: the connection's minimum moves the history pair deeper, and never shallower than the request's depth", async () => {
  // Request depth 1 (SHAPE's), user minimum 3 ⇒ the pair sits at depths 3 and 5: a1 (message 3) and a0 (message 1).
  const deeper = markersInPrefixOrder((await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 3 }, 1), anthropicTextStream("ok"))).body);
  expect(deeper.map(({ at }) => at)).toEqual(["tool:1", "system", "message:1", "message:3"]);
  // Request depth 3 (already floored by the admin `promptCacheMinDepth` upstream), user minimum 1 ⇒ the
  // request's depth stands: the user value is bounded below by it.
  const floored = markersInPrefixOrder((await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 1 }, 3), anthropicTextStream("ok"))).body);
  expect(floored.map(({ at }) => at)).toEqual(["tool:1", "system", "message:1", "message:3"]);
});
