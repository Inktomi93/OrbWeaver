// biome-ignore-all lint/style/useNamingConvention: synthetic OpenAI-compatible wire fixtures + the user's
// customParameters use snake_case (finish_reason, prompt_tokens, reasoning_effort, …) — the real wire.
//
// backends/custom-byo/runners/chat — the raw-fetch BYO chat runner: request mapping (customParameters
// overlay + credential headers + bearer auth), the user-declared model PROFILE (read from the capability,
// never a baked window — the §1a fix), response RESHAPING of a NON-standard body (`reshapeChunk`), stream +
// non-stream paths, and HTTP/in-band error classification. Fetch is mocked; the clock injected.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatRequest, ChatResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { createCustomByoBackend, reshapeChunk } from "@orb/server/infra/providers/backends/custom-byo";
import { afterEach, describe, vi } from "vitest";
import { makeCustomOpenAiCredential, makeOpenRouterCredential } from "../../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";
import { wireSchema } from "../../../../../../support/wire-ready.ts";

const FIXED_NOW = 1000;
const BASE_URL = "https://byo.example.com/v1";
const EXPECTED_URL = "https://byo.example.com/v1/chat/completions";
const SECRET_KEY = "sk-secret-123";
const CUSTOM_WINDOW = 32_768;
const CUSTOM_MAX_OUTPUT = 2048;

// A user-declared model profile: a 32k window + 2k output that is NOT neo's baked 128k/4096 — the assertion
// that the result reflects THIS, not a constant, is the §1a "nothing baked" proof. The sampling ranges mirror
// what `domain/connection` actually synthesizes for a `custom_openai` connection (`staticProfile(window,
// fullSampling:true)`) — the runner now funnels every knob through `resolveChat`, so a fixture with an EMPTY
// sampling cell would test a capability no BYO connection ever receives.
const CAPABILITY: ModelCapability = {
  reasoning: { mode: "none", enabled: false },
  sampling: {
    temperature: { min: 0, max: 2 },
    topP: { min: 0, max: 1 },
    topK: { min: 0, max: 200 },
    frequencyPenalty: { min: -2, max: 2 },
    presencePenalty: { min: -2, max: 2 },
    repetitionPenalty: { min: 0, max: 2 },
    minP: { min: 0, max: 1 },
    topA: { min: 0, max: 1 },
    seed: true,
    stop: true,
  },
  output: { maxTokens: { min: 1, max: CUSTOM_MAX_OUTPUT } },
  context: { window: CUSTOM_WINDOW },
};

// The same profile with reasoning ON, effort-mode, allowlisted to low/medium — a BYO endpoint whose model id
// hits the curated catalog (e.g. a LiteLLM proxy fronting a reasoning model) resolves a capability like this.
const REASONING_CAPABILITY: ModelCapability = {
  ...CAPABILITY,
  reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium"] },
};

const CRED_BASE = { baseUrl: BASE_URL, apiKey: SECRET_KEY, headers: { "x-team": "alpha" } };
const CRED: ResolvedCredential = makeCustomOpenAiCredential(CRED_BASE);

const DEPS = { now: (): number => FIXED_NOW, random: (): number => 0.5 };

// The exact `api:"chat-completions"` arm — annotating overrides to this arm (not the whole union) keeps the
// spread result a single discriminated member (no widened `api`, no stray optional `prompt`).
type ChatCompletionsRequest = Extract<ChatRequest, { api: "chat-completions" }>;

function makeRequest(overrides: Partial<ChatCompletionsRequest> = {}): ChatCompletionsRequest {
  return {
    api: "chat-completions",
    credential: CRED,
    model: castId<ModelId>("local-model"),
    capability: CAPABILITY,
    params: { temperature: 0.7 },
    systemPrompt: { static: "You are a bot.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    ...overrides,
  };
}

// The backend's `runChatTurn` is optional on the contract (a backend implements only the roles it serves);
// custom-byo always sets it. Pull it through a typed helper so the await is on a real Promise.
function runTurnWith(deps: Parameters<typeof createCustomByoBackend>[0], req: ChatRequest): Promise<ChatResult> {
  const run = createCustomByoBackend(deps).runChatTurn;
  if (run === undefined) {
    throw new Error("custom-byo backend must implement runChatTurn");
  }
  return run(req);
}

function runTurn(req: ChatRequest): Promise<ChatResult> {
  return runTurnWith(DEPS, req);
}

// A streaming SSE body whose `.body` is a real ReadableStream (what the runner reads).
function sseResponse(lines: readonly string[], status = 200): Response {
  return new Response(`${lines.join("\n")}\n`, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCustomByoBackend — request mapping", () => {
  test("merges customParameters + credential headers + bearer auth; targets <baseUrl>/chat/completions", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    let capturedHeaders = new Headers();
    vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit): Response => {
      capturedUrl = String(url);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
        "data: [DONE]",
      ]);
    });

    await runTurn(makeRequest({ customParameters: { reasoning_effort: "high", temperature: 0.2 } }));

    expect(capturedUrl).toBe(EXPECTED_URL);
    expect(capturedHeaders.get("authorization")).toBe(`Bearer ${SECRET_KEY}`);
    expect(capturedHeaders.get("x-team")).toBe("alpha");
    // customParameters win over the base sampling (user-controlled overlay) + add new keys.
    expect(capturedBody["temperature"]).toBe(0.2);
    expect(capturedBody["reasoning_effort"]).toBe("high");
    expect(capturedBody["model"]).toBe("local-model");
    expect(capturedBody["stream"]).toBe(true);
    expect(capturedBody["messages"]).toEqual([
      { role: "system", content: "You are a bot." },
      { role: "user", content: "Hi" },
    ]);
  });

  test("projects the user's minP onto the min_p wire field (D68-A)", async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}', "data: [DONE]"]);
    });
    await runTurn(makeRequest({ params: { minP: 0.04 } }));
    expect(capturedBody["min_p"]).toBe(0.04);
  });

  test("a __proto__/constructor-carrying customParameters does not pollute Object.prototype, legit keys still merge (PD-101 Layer 2)", async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}', "data: [DONE]"]);
    });

    const poison = JSON.parse('{"reasoning_effort":"high","__proto__":{"polluted":true},"nested":{"constructor":{"polluted":true},"ok":1}}') as Record<
      string,
      unknown
    >;
    await runTurn(makeRequest({ customParameters: poison }));

    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(capturedBody["polluted"]).toBeUndefined();
    expect(capturedBody["reasoning_effort"]).toBe("high");
    expect(capturedBody["nested"]).toEqual({ ok: 1 });
  });

  // STRICTFMT: a BYO endpoint is an ARBITRARY OpenAI-compatible server (an OpenAI-family proxy included), and
  // OpenAI-family endpoints 400 on `strict:true` for a schema that isn't all-required ("'required' is required
  // to be supplied" — the 2026-08-02 probe matrix pinned in backends/openrouter/index.ts). Our schemas are
  // optional-by-construction, so an invented `strict:true` is a 400 landmine. This runner never invents the
  // value: `strict` rides ONLY when the caller set it.
  test("response_format carries NO strict when the caller did not set one (no invented policy)", async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}', "data: [DONE]"]);
    });
    await runTurn(makeRequest({ responseFormat: { name: "extract", schema: wireSchema({ type: "object" }) } }));
    expect(capturedBody["response_format"]).toEqual({
      type: "json_schema",
      json_schema: { name: "extract", schema: { type: "object" } },
    });
  });

  test("response_format forwards an EXPLICIT strict verbatim (the caller's word, either way)", async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}', "data: [DONE]"]);
    });
    await runTurn(makeRequest({ responseFormat: { name: "extract", schema: wireSchema({}), strict: true, description: "d" } }));
    expect(capturedBody["response_format"]).toEqual({
      type: "json_schema",
      json_schema: { name: "extract", schema: {}, strict: true, description: "d" },
    });
  });

  test("omits the Authorization header for a keyless (apiKey:null) endpoint", async () => {
    let capturedHeaders = new Headers();
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedHeaders = new Headers(init?.headers);
      return sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}', "data: [DONE]"]);
    });
    const keyless = makeCustomOpenAiCredential({ ...CRED_BASE, apiKey: null, headers: null });
    await runTurn(makeRequest({ credential: keyless }));
    expect(capturedHeaders.has("authorization")).toBe(false);
  });
});

// EFF-2: the BYO wire is built from `resolveChat(params, capability)` — the same funnel every hosted runner
// uses. What these pin: the plain-path body did NOT move (self-hosted chat is the live dogfood path), the
// resolved effort reaches THIS wire's `reasoning_effort`, an unsupported knob is dropped LOUDLY (never
// silently), and the `customParameters` escape hatch still wins over anything the funnel resolved.
describe("createCustomByoBackend — resolveChat unification (EFF-2)", () => {
  // Captures the literal body the runner POSTs.
  function captureBody(): { readonly read: () => Record<string, unknown> } {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}', 'data: {"choices":[{"finish_reason":"stop"}]}', "data: [DONE]"]);
    });
    return { read: (): Record<string, unknown> => body };
  }

  test("a plain request's wire body is UNCHANGED by the funnel (no reasoning field; max_tokens, not max_completion_tokens)", async () => {
    const wire = captureBody();
    await runTurn(makeRequest({ params: { temperature: 0.7, topP: 0.9, maxOutputTokens: 512 } }));
    // The exact pre-unification shape, key for key: the funnel is a pass-through when every knob is in range
    // and the capability declares no reasoning.
    expect(wire.read()).toEqual({
      model: "local-model",
      messages: [
        { role: "system", content: "You are a bot." },
        { role: "user", content: "Hi" },
      ],
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 512,
    });
  });

  test("a plain request emits NO warning events (a clean turn stays quiet)", async () => {
    captureBody();
    const events: string[] = [];
    const result = await runTurn(makeRequest({ onEvent: (e): void => void events.push(e.kind) }));
    expect(events).toEqual([]);
    expect(result.events).toEqual([]);
  });

  test("the resolved effort reaches the wire as reasoning_effort when the capability supports it", async () => {
    const wire = captureBody();
    await runTurn(makeRequest({ capability: REASONING_CAPABILITY, params: { effort: "medium" } }));
    expect(wire.read()["reasoning_effort"]).toBe("medium");
  });

  test("the quality dial's effort + sampling fallback reaches the wire (the funnel resolution custom-byo previously skipped)", async () => {
    const wire = captureBody();
    await runTurn(makeRequest({ capability: { ...CAPABILITY, reasoning: { mode: "effort", enabled: true } }, params: { quality: "deep" } }));
    expect(wire.read()["reasoning_effort"]).toBe("high"); // QUALITY_EFFORT.deep
    expect(wire.read()["temperature"]).toBe(1); // QUALITY_SAMPLING.deep
  });

  test("our `max` effort level maps to the wire's `xhigh` (the kit's vocab, never re-spelled here)", async () => {
    const wire = captureBody();
    await runTurn(makeRequest({ capability: { ...CAPABILITY, reasoning: { mode: "effort", enabled: true } }, params: { effort: "max" } }));
    expect(wire.read()["reasoning_effort"]).toBe("xhigh");
  });

  test("an effort outside the capability's allowlist is CLAMPED OUT: no wire field + a loud effort_dropped warning", async () => {
    const wire = captureBody();
    const events: Array<{ kind: string; code?: string }> = [];
    const result = await runTurn(
      makeRequest({
        capability: REASONING_CAPABILITY,
        params: { effort: "high" },
        onEvent: (e): void => void events.push({ kind: e.kind, ...("code" in e ? { code: e.code } : {}) }),
      }),
    );
    expect(wire.read()).not.toHaveProperty("reasoning_effort");
    expect(events).toEqual([{ kind: "warning", code: "effort_dropped" }]);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "warning", code: "effort_dropped" }));
  });

  test("mandatory reasoning clamps an absent effort UP to the lowest supported level (never a silent 400)", async () => {
    const wire = captureBody();
    const events: Array<{ code?: string }> = [];
    await runTurn(
      makeRequest({
        capability: { ...CAPABILITY, reasoning: { mode: "effort", enabled: true, mandatory: true, effortLevels: ["medium", "high"] } },
        onEvent: (e): void => void events.push({ ...("code" in e ? { code: e.code } : {}) }),
      }),
    );
    expect(wire.read()["reasoning_effort"]).toBe("medium");
    expect(events).toEqual([{ code: "reasoning_mandatory_clamp" }]);
  });

  test("a budget-mode reasoning budget has no slot on this wire — dropped LOUDLY, not silently", async () => {
    const wire = captureBody();
    const events: Array<{ code?: string; message?: string }> = [];
    await runTurn(
      makeRequest({
        capability: { ...CAPABILITY, reasoning: { mode: "budget", enabled: true, budgetRange: { min: 1024, max: 8192 } } },
        params: { effort: "high", thinkingBudgetTokens: 4096 },
        onEvent: (e): void => void events.push("code" in e ? { code: e.code, message: e.message } : {}),
      }),
    );
    expect(wire.read()).not.toHaveProperty("reasoning_effort");
    expect(events).toContainEqual(expect.objectContaining({ code: "sampling_knob_dropped", message: expect.stringContaining("thinkingBudgetTokens") }));
  });

  test("a sampling knob the capability omits is dropped with a loud sampling_knob_dropped (logit_bias never reaches the wire)", async () => {
    const wire = captureBody();
    const events: Array<{ code?: string }> = [];
    await runTurn(
      makeRequest({
        params: { logitBias: { "1": 2 } },
        onEvent: (e): void => void events.push({ ...("code" in e ? { code: e.code } : {}) }),
      }),
    );
    expect(wire.read()).not.toHaveProperty("logit_bias");
    expect(events).toEqual([{ code: "sampling_knob_dropped" }]);
  });

  test("out-of-range knobs are CLAMPED into the capability's ranges (temperature + the output cap)", async () => {
    const wire = captureBody();
    await runTurn(makeRequest({ params: { temperature: 5, maxOutputTokens: 999_999 } }));
    expect(wire.read()["temperature"]).toBe(2);
    expect(wire.read()["max_tokens"]).toBe(CUSTOM_MAX_OUTPUT);
  });

  test("customParameters still win over a RESOLVED field, and can re-add one the funnel dropped (BYOK escape hatch)", async () => {
    const wire = captureBody();
    await runTurn(
      makeRequest({
        // temperature 5 resolves (clamps) to 2; logitBias is dropped by the capability gate.
        params: { temperature: 5, logitBias: { "1": 2 } },
        customParameters: { temperature: 0.15, logit_bias: { "7": -1 } },
      }),
    );
    expect(wire.read()["temperature"]).toBe(0.15);
    expect(wire.read()["logit_bias"]).toEqual({ "7": -1 });
  });

  // D41, mirroring the OR-4 fix on the OpenRouter runner: `isError` on a tool result has NO slot on this
  // wire either (the OpenAI `tool` message is role/tool_call_id/content), so the model reads a failed tool
  // result as an ordinary one. Nothing is invented onto the wire to carry it — the drop is made LOUD.
  test("a tool-result isError:true drops loudly as `tool_result_error_dropped` (D41)", async () => {
    const wire = captureBody();
    const events: Array<{ code?: string; message?: string }> = [];
    const result = await runTurn(
      makeRequest({
        history: [
          { role: "user", content: [{ type: "text", text: "go" }] },
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "call_1", name: "tick", arguments: "{}" }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", content: '{"err":"boom"}', isError: true }] },
        ],
        onEvent: (e): void => void events.push("code" in e ? { code: e.code, message: e.message } : {}),
      }),
    );
    const messages = wire.read()["messages"] as Record<string, unknown>[];
    expect(messages.at(-1)).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"err":"boom"}' });
    expect(result.events).toContainEqual({
      kind: "warning",
      at: FIXED_NOW,
      code: "tool_result_error_dropped",
      message: "tool-result isError ignored: the OpenAI-compatible chat-completions wire has no tool-result error field",
    });
    expect(events).toContainEqual(expect.objectContaining({ code: "tool_result_error_dropped" }));
  });

  test("a SUCCESSFUL tool result (no isError) emits NO tool_result_error_dropped warning", async () => {
    captureBody();
    const result = await runTurn(
      makeRequest({
        history: [
          { role: "user", content: [{ type: "text", text: "go" }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", content: '{"ok":true}' }] },
        ],
      }),
    );
    expect(result.events.filter((e) => e.kind === "warning" && e.code === "tool_result_error_dropped")).toEqual([]);
  });
});

describe("createCustomByoBackend — streaming + non-streaming + the user-declared profile", () => {
  test("streams an SSE reply, accumulates reasoning, reports the user-declared window/output (NOT baked)", async () => {
    vi.stubGlobal(
      "fetch",
      (): Response =>
        sseResponse([
          'data: {"choices":[{"delta":{"reasoning":"thinking"}}]}',
          'data: {"choices":[{"delta":{"content":"Hello"}}]}',
          'data: {"choices":[{"delta":{"content":", world"}}]}',
          'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
          "data: [DONE]",
        ]),
    );
    const deltas: Array<{ kind: string; text: string }> = [];
    const result = await runTurn(
      makeRequest({
        chatId: castId<ChatId>("chat-1"),
        onDelta: (event): void => {
          deltas.push({ kind: event.kind, text: event.text });
        },
      }),
    );

    expect(result.reply).toBe("Hello, world");
    expect(result.reasoning).toBe("thinking");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.tokensIn).toBe(5);
    expect(result.usage.tokensOut).toBe(2);
    // The §1a fix: profile is the user-declared capability, not a hardcoded 128k/4096.
    expect(result.usage.contextWindow).toBe(CUSTOM_WINDOW);
    expect(result.usage.maxOutputTokens).toBe(CUSTOM_MAX_OUTPUT);
    expect(result.durationApiMs).toBe(0); // FIXED_NOW - FIXED_NOW (injected clock)
    expect(deltas).toEqual([
      { kind: "reasoning", text: "thinking" },
      { kind: "text", text: "Hello" },
      { kind: "text", text: ", world" },
    ]);
  });

  test("reads a NON-streaming JSON body (an endpoint that ignored stream:true)", async () => {
    vi.stubGlobal(
      "fetch",
      (): Response =>
        jsonResponse({
          choices: [{ message: { content: "one-shot reply" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 4, completion_tokens: 3 },
        }),
    );
    const result = await runTurn(makeRequest());
    expect(result.reply).toBe("one-shot reply");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.tokensOut).toBe(3);
  });

  test("threads the credential's responseMap over the streaming defaults (PD-13)", async () => {
    vi.stubGlobal("fetch", (): Response => sseResponse(['data: {"out":{"text":"mapped "}}', 'data: {"out":{"text":"hi"},"done":"stop"}', "data: [DONE]"]));
    // Only `contentPath`/`finishReasonPath` overridden — the untouched default paths still apply.
    const cred = makeCustomOpenAiCredential({
      ...CRED_BASE,
      responseMap: { contentPath: "out.text", finishReasonPath: "done" },
    });
    const result = await runTurn(makeRequest({ credential: cred }));
    expect(result.reply).toBe("mapped hi");
    expect(result.finishReason).toBe("stop");
  });

  test("applies the credential's includeBody/excludeBody to the request body (PD-13)", async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}', "data: [DONE]"]);
    });
    const cred = makeCustomOpenAiCredential({
      ...CRED_BASE,
      includeBody: { safety: "off" },
      excludeBody: ["stream"],
    });
    await runTurn(makeRequest({ credential: cred }));
    expect(capturedBody["safety"]).toBe("off");
    // excludeBody strips LAST — `stream` is removed even though the base body set it true.
    expect(capturedBody).not.toHaveProperty("stream");
  });
});

// F4 (SECURITY): `includeBody` is user-controlled and can carry key-in-body auth (nonstandard endpoints), so a
// raw wire capture would sink a plaintext credential into the debug ring. The runner scrubs the known secret
// literals (the apiKey + any secret-valued header) out of the CAPTURED body by value — while the body actually
// SENT to the endpoint keeps the plaintext (the endpoint needs it). Credential-leak-by-value class.
describe("createCustomByoBackend — captured wire scrubs credential literals (F4)", () => {
  const REDACTED = "«redacted»";
  const HEADER_SECRET = "hdr-secret-abcdef123456";

  test("an includeBody-embedded apiKey is REDACTED in the capture but PLAINTEXT on the sent body", async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      sentBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}', "data: [DONE]"]);
    });
    const captured: Record<string, unknown>[] = [];
    // The user pastes their key into the body (a real nonstandard-endpoint pattern) AND a secret-valued header.
    const cred = makeCustomOpenAiCredential({
      ...CRED_BASE,
      apiKey: SECRET_KEY,
      headers: { "x-team": "alpha", "x-api-key": HEADER_SECRET },
      includeBody: { auth_token: SECRET_KEY, note: `bearer ${HEADER_SECRET}` },
    });
    await runTurnWith({ ...DEPS, captureWire: (e): void => void captured.push(e.body) }, makeRequest({ credential: cred }));

    // The capture redacted BOTH secrets by value — nothing plaintext lands in the ring.
    const wire = captured.at(0);
    expect(wire?.["auth_token"]).toBe(REDACTED);
    expect(JSON.stringify(wire)).not.toContain(SECRET_KEY);
    expect(JSON.stringify(wire)).not.toContain(HEADER_SECRET);
    // But the endpoint still receives the plaintext key-in-body (scrub is capture-only, never on the real send).
    expect(sentBody["auth_token"]).toBe(SECRET_KEY);
  });

  test("a secret-free body round-trips unchanged (scrub is a no-op when no secrets are present)", async () => {
    vi.stubGlobal("fetch", (): Response => sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}', "data: [DONE]"]));
    const captured: Record<string, unknown>[] = [];
    // Keyless endpoint, no secret headers → no secret literals to scrub.
    const cred = makeCustomOpenAiCredential({ ...CRED_BASE, apiKey: null, headers: null, includeBody: { safety: "off" } });
    await runTurnWith({ ...DEPS, captureWire: (e): void => void captured.push(e.body) }, makeRequest({ credential: cred }));
    expect(captured.at(0)?.["safety"]).toBe("off");
    expect(captured.at(0)?.["model"]).toBe("local-model");
  });
});

describe("reshapeChunk — the user-declared RESPONSE map (the part neo faked)", () => {
  test("reshapes a NON-standard nested body via custom dot-paths into the OpenAI chunk", () => {
    const nonStandard = {
      result: { text: "remapped!", thoughts: "deep" },
      meta: { stop: "length", tokens: { in: 11, out: 7 } },
    };
    const chunk = reshapeChunk(nonStandard, {
      contentPath: "result.text",
      reasoningPath: "result.thoughts",
      finishReasonPath: "meta.stop",
      promptTokensPath: "meta.tokens.in",
      completionTokensPath: "meta.tokens.out",
    });
    expect(chunk.choices[0]?.delta?.content).toBe("remapped!");
    expect(chunk.choices[0]?.delta?.reasoning).toBe("deep");
    expect(chunk.choices[0]?.finishReason).toBe("length");
    expect(chunk.usage?.promptTokens).toBe(11);
    expect(chunk.usage?.completionTokens).toBe(7);
  });

  test("a missing path yields a null content delta (never throws); array segments index by number", () => {
    const chunk = reshapeChunk({ choices: [{ delta: { content: "idx" } }] }, { contentPath: "choices.0.delta.content", reasoningPath: "nope.gone" });
    expect(chunk.choices[0]?.delta?.content).toBe("idx");
    expect(chunk.choices[0]?.delta?.reasoning).toBeUndefined();
    expect(chunk.usage).toBeUndefined();
  });
});

describe("createCustomByoBackend — error classification", () => {
  test("a non-2xx (401) maps to a typed auth_failed ProviderError carrying the status", async () => {
    vi.stubGlobal("fetch", (): Response => new Response("nope", { status: 401 }));
    await expect(runTurn(makeRequest())).rejects.toMatchObject({
      name: "ProviderError",
      kind: "auth_failed",
      retryable: false,
      apiErrorStatus: 401,
    });
  });

  test("a 400 maps to a non-retryable invalid ProviderError", async () => {
    vi.stubGlobal("fetch", (): Response => new Response("bad request", { status: 400 }));
    await expect(runTurn(makeRequest())).rejects.toMatchObject({
      kind: "invalid",
      retryable: false,
    });
  });

  test("an in-band stream error is promoted to a classified ProviderError (not a silent empty reply)", async () => {
    vi.stubGlobal("fetch", (): Response => sseResponse(['data: {"error":{"message":"context too long","code":400}}', "data: [DONE]"]));
    await expect(runTurn(makeRequest())).rejects.toBeInstanceOf(ProviderError);
  });

  test("fail-closes on a non-custom_openai credential", async () => {
    const wrongCred = makeOpenRouterCredential();
    await expect(runTurn(makeRequest({ credential: wrongCred }))).rejects.toMatchObject({
      kind: "invalid",
    });
  });

  // #25 (SECURITY, mirrors inspect.ts #21): a 3xx from the user's endpoint must NOT be followed with the
  // credentials in tow (open-redirect → credential exfil). The turn fetch pins `redirect:"manual"` and rejects
  // a 3xx as a hard, non-retryable error — so there is never a SECOND, credentialed request to another host.
  test("a 3xx redirect is REJECTED (non-retryable) with no follow and no second credentialed request", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      if (init !== undefined) {
        calls.push(init);
      }
      // A misconfigured / malicious endpoint answering with `302 → https://attacker/…`.
      return Response.redirect("https://attacker.example.com/steal", 302);
    });

    await expect(runTurn(makeRequest())).rejects.toMatchObject({
      name: "ProviderError",
      kind: "invalid",
      retryable: false,
    });

    // Exactly ONE fetch — the redirect was neither followed nor retried (a follow/retry would re-send the key).
    expect(calls).toHaveLength(1);
    // The host-pin is on the wire: the turn fetch requested manual redirect handling.
    expect(calls[0]?.redirect).toBe("manual");
    // The one request DID carry the credential (it must, to reach the real endpoint) — proving the belt is the
    // manual-redirect pin, not an accidental absence of the header.
    const headers = calls[0]?.headers as Record<string, string> | undefined;
    expect(headers?.["authorization"]).toBe(`Bearer ${SECRET_KEY}`);
  });
});
