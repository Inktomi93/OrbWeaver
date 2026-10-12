// backends/openai-compat/chat — the record-truth pins (appliedEffort, rate-limit snapshot, generationId), the template thinking state, parallel tool calls and the default effort on the OpenRouter wire.

import type { EFFORT_SPELLINGS } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedSseFetch } from "../_hosted-support.ts";
import type { OpenAiCompatChatRequest } from "./_chat-support.ts";
import { NOW, orCuratedConnection, orRequest, runOpenAiCompatChatTurn, sentBody, turnDeps, warningCodes } from "./_chat-support.ts";

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

// ── the template thinking state (body rule 5b) ───────────────────────────────────────────────────────────
// A server's own thinking default decides a turn the preset left unset. On a folded RPG turn (terminal tools
// attached) a template that thinks answers with the state calls alone, so an unset preset is spelled off there.

const REASONING_EFFORT_CAPABILITY = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });

function rowRequest(providerId: string, params: UserIntent, terminalToolsAttached: boolean): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId,
    model: "m",
    capability: REASONING_EFFORT_CAPABILITY,
    baseUrl: "http://127.0.0.1:1/v1",
    secret: fakeApiKeySecret("sk-not-a-real-key"),
  });
  return orRequest({ connection, params, ...(terminalToolsAttached ? { terminalToolsAttached: true } : {}) });
}

const kwargsOf = (body: Record<string, unknown>): unknown => body["chat_template_kwargs"];

test("a folded turn on a row with a thinking switch sends thinking off when the preset leaves reasoning unset", async () => {
  expect(kwargsOf(await sentBody(rowRequest("vllm", {}, true)))).toEqual({ enable_thinking: false, preserve_reasoning: false });
  // Outside a folded turn the unset choice still falls to the server's default: nothing rides.
  expect(kwargsOf(await sentBody(rowRequest("vllm", {}, false)))).toBeUndefined();
});

test("a folded turn with reasoning unset never tells a mandatory-reasoning model's template off", async () => {
  const mandatory = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], mandatory: true } });
  const req = rowRequest("vllm", {}, true);
  const body = await sentBody({ ...req, connection: { ...req.connection, capability: mandatory } });
  expect(kwargsOf(body)).toBeUndefined();
});

test("the preset's own reasoning choice rides on a row with a thinking switch, folded or not", async () => {
  for (const terminal of [true, false]) {
    expect(kwargsOf(await sentBody(rowRequest("llama-cpp", { effort: "high" }, terminal))), `terminal ${String(terminal)}`).toEqual({
      enable_thinking: true,
      preserve_reasoning: false,
    });
    expect(kwargsOf(await sentBody(rowRequest("llama-cpp", { effort: "none" }, terminal))), `terminal ${String(terminal)}`).toEqual({
      enable_thinking: false,
      preserve_reasoning: false,
    });
  }
});

test("a Custom connection sends the switch, and the user's own body or a declared none outranks it", async () => {
  expect(kwargsOf(await sentBody(rowRequest("custom-openai", {}, true)))).toEqual({ enable_thinking: false, preserve_reasoning: false });
  expect(kwargsOf(await sentBody(rowRequest("custom-openai", { effort: "none" }, false)))).toEqual({ enable_thinking: false, preserve_reasoning: false });
  const custom = (overrides: Omit<Parameters<typeof fakeResolved<"chat">>[0], "task">): OpenAiCompatChatRequest =>
    orRequest({ connection: fakeResolved({ ...overrides, task: "chat" }), params: {}, terminalToolsAttached: true });
  const base = {
    providerId: "custom-openai",
    model: "m",
    capability: REASONING_EFFORT_CAPABILITY,
    baseUrl: "http://127.0.0.1:1/v1",
    secret: fakeApiKeySecret("sk-not-a-real-key"),
  } as const;
  // The user's extras state thinking on: theirs rides, not the folded turn's off.
  expect(kwargsOf(await sentBody(custom({ ...base, extras: { chat_template_kwargs: { enable_thinking: true } } })))).toEqual({
    enable_thinking: true,
    preserve_reasoning: false,
  });
  // The preset's temperature reaches the SDK; the connection's own body says otherwise, and the body wins.
  const hot = await sentBody({
    ...custom({ ...base, extras: { temperature: 1.2, top_p: 0.5 } }),
    params: { temperature: 0.8, topP: 0.9 },
  });
  expect([hot["temperature"], hot["top_p"]]).toEqual([1.2, 0.5]);
  // A strict proxy: the connection excludes the key, or declares the row has no switch. Nothing rides.
  expect(kwargsOf(await sentBody(custom({ ...base, transport: { excludeBody: ["chat_template_kwargs"] } })))).toBeUndefined();
  expect(kwargsOf(await sentBody(custom({ ...base, declaredFeatures: { thinkingOff: "none" } })))).toBeUndefined();
});

test("hosted rows without a thinking switch are byte-identical whether or not the turn folds", async () => {
  for (const providerId of ["openrouter", "openai"]) {
    for (const params of [{}, { effort: "high" }, { effort: "none" }] satisfies UserIntent[]) {
      const folded = await sentBody(rowRequest(providerId, params, true));
      expect(kwargsOf(folded), providerId).toBeUndefined();
      expect(folded, `${providerId} ${JSON.stringify(params)}`).toEqual(await sentBody(rowRequest(providerId, params, false)));
    }
  }
});

// Off is a choice the wire has to carry: a reasoning model left without `reasoning_effort` reasons at its own
// default, which spends the tokens and latency the user turned off.
function offRequest(
  reasoning: Parameters<typeof generationCapability>[0],
  params: OpenAiCompatChatRequest["params"] = { effort: "none" },
  thinkingOff?: "none" | undefined,
): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability(reasoning),
    baseUrl: "https://box.local/v1",
    secret: fakeApiKeySecret("sk-box-not-a-real-key"),
    declaredFeatures: { effort: "reasoning_effort", ...(thinkingOff === undefined ? {} : { thinkingOff }) },
  });
  return orRequest({ connection, params, tools: undefined });
}

// The preset's parallel-tool switch turned OFF (`false`) must reach a tools request on both dialects; unset sends
// nothing, so the endpoint's own default stands.
test("parallelToolCalls false sends parallel_tool_calls false on both dialects; unset sends no field", async () => {
  const direct = offRequest({ reasoning: { mode: "none", enabled: false } }, { advanced: { parallelToolCalls: false } });
  const tools = orRequest().tools;
  expect((await sentBody({ ...direct, tools }))["parallel_tool_calls"]).toBe(false);
  expect((await sentBody(orRequest({ params: { advanced: { parallelToolCalls: false } } })))["parallel_tool_calls"]).toBe(false);
  expect(await sentBody({ ...offRequest({ reasoning: { mode: "none", enabled: false } }, {}), tools })).not.toHaveProperty("parallel_tool_calls");
  expect(await sentBody(orRequest({ params: {} }))).not.toHaveProperty("parallel_tool_calls");
});

// A stored `true` is the endpoint's own default, and some OpenAI-compatible layers refuse the field outright
// (Gemini: `Unknown name "parallel_tool_calls"`), so it never goes out on either dialect.
test("parallelToolCalls true sends no parallel_tool_calls field on either dialect", async () => {
  const direct = offRequest({ reasoning: { mode: "none", enabled: false } }, { advanced: { parallelToolCalls: true } });
  expect(await sentBody({ ...direct, tools: orRequest().tools })).not.toHaveProperty("parallel_tool_calls");
  expect(await sentBody(orRequest({ params: { advanced: { parallelToolCalls: true } } }))).not.toHaveProperty("parallel_tool_calls");
});

test("off sends reasoning_effort none where the model can turn reasoning off, and records none as applied", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(
    offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }, { effort: "none" }, "none"),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  );
  expect(recorded[0]?.body["reasoning_effort"]).toBe("none");
  expect(turn.appliedEffort).toBe("none");
});

// Where the row's thinking switch is the template kwarg, the kwarg is the off: `none` beside it would contradict it.
test("off on a row whose switch is the template kwarg sends enable_thinking false alone, and records none as applied", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(
    offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  );
  expect(recorded[0]?.body["chat_template_kwargs"]).toMatchObject({ enable_thinking: false });
  expect(recorded[0]?.body).not.toHaveProperty("reasoning_effort");
  expect(turn.appliedEffort).toBe("none");
});

// An unset effort is the model's own default, never a hidden off: the field is omitted, on an optional and on a
// mandatory model alike.
test("an unset effort omits reasoning_effort, so the model reasons at its own default", async () => {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(
    offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }, {}),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  );
  expect("reasoning_effort" in (recorded[0]?.body ?? {})).toBe(false);
  expect(turn.appliedEffort).toBeNull();
  const mandatory = await sentBody(offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], mandatory: true } }, {}));
  expect("reasoning_effort" in mandatory).toBe(false);
});

test("off on a model that cannot turn reasoning off clamps to its lowest level, and a non-reasoning model sends no field", async () => {
  const mandatory = await sentBody(offRequest({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], mandatory: true } }));
  expect(mandatory["reasoning_effort"]).toBe("low");
  const plain = await sentBody(offRequest({ reasoning: { mode: "none", enabled: false } }));
  expect("reasoning_effort" in plain).toBe(false);
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

test("OR: an unset effort with no advertised default sends no reasoning block, and a chosen off sends effort none", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "google/gemini-3.5-flash",
    capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  expect("reasoning" in (await sentBody(orRequest({ connection, tools: undefined, params: {} })))).toBe(false);
  expect((await sentBody(orRequest({ connection, tools: undefined, params: { effort: "none" } })))["reasoning"]).toEqual({ effort: "none" });
});

// OpenRouter's own `reasoning.effort` takes `max` and forwards it upstream verbatim (audit echo: effort "max" →
// output_config.effort "max"); only the V4 vocabulary lacks the word. The funnel has already refused a level
// the model does not list, so the openrouter spelling passes the resolved word through.
// `max` was measured upstream only on the adaptive Claude ids. An OpenAI or Gemini row whose catalog lists every
// level (or none, which folds to every level) keeps the V4 mapping it always had: `max` goes out as `xhigh`.
test("OR non-adaptive reasoning keeps `max` → `xhigh`, byte for byte", async () => {
  for (const [model, reasoning] of [
    ["openai/gpt-5.4", { mode: "effort", enabled: true, effortLevels: ["minimal", "low", "medium", "high", "xhigh", "max"] }],
    ["openai/gpt-5.6-sol", { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] }],
    ["google/gemini-3.5-flash", { mode: "effort", enabled: true, effortLevels: ["minimal", "low", "medium", "high", "xhigh", "max"] }],
  ] as const) {
    const connection = fakeResolved({
      task: "chat",
      providerId: "openrouter",
      model,
      capability: generationCapability({ reasoning: { ...reasoning, effortLevels: [...reasoning.effortLevels] } }),
      secret: fakeApiKeySecret("sk-or-not-a-real-key"),
    });
    const body = await sentBody(orRequest({ connection, tools: undefined, params: { effort: "max" } }));
    expect(body["reasoning"], model).toEqual({ effort: "xhigh" });
  }
});

test("OR Claude effort `max` reaches the wire as `max`, not `xhigh`", async () => {
  const body = await sentBody(orRequest({ connection: orCuratedConnection("anthropic/claude-opus-5"), tools: undefined, params: { effort: "max" } }));
  expect(body["reasoning"]).toEqual({ effort: "max" });
});

/** The prompt as the cache reads it: a boundary entry per message, then one entry per part (a string body is its
 *  one text part), with the `cache_control` marker set aside (it is not prompt bytes) and reported as the entry
 *  index it rode on. */
