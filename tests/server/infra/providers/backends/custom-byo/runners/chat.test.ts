// biome-ignore-all lint/style/useNamingConvention: synthetic OpenAI-compatible wire fixtures + the user's
// customParameters use snake_case (finish_reason, prompt_tokens, reasoning_effort, …) — the real wire.
//
// backends/custom-byo/runners/chat — the raw-fetch BYO chat runner: request mapping (customParameters
// overlay + credential headers + bearer auth), the user-declared model PROFILE (read from the capability,
// never a baked window — the §1a fix), response RESHAPING of a NON-standard body (`reshapeChunk`), stream +
// non-stream paths, and HTTP/in-band error classification. Fetch is mocked; the clock injected.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatRequest, ChatResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import {
  createCustomByoBackend,
  reshapeChunk,
} from "@orb/server/infra/providers/backends/custom-byo";
import { afterEach, describe, vi } from "vitest";
import {
  makeCustomOpenAiCredential,
  makeOpenRouterCredential,
} from "../../../../../../support/factories/resolved-connection";
import { expect, test } from "../../../../../../support/fixtures";

const FIXED_NOW = 1000;
const BASE_URL = "https://byo.example.com/v1";
const EXPECTED_URL = "https://byo.example.com/v1/chat/completions";
const SECRET_KEY = "sk-secret-123";
const CUSTOM_WINDOW = 32_768;
const CUSTOM_MAX_OUTPUT = 2048;

// A user-declared model profile: a 32k window + 2k output that is NOT neo's baked 128k/4096 — the assertion
// that the result reflects THIS, not a constant, is the §1a "nothing baked" proof.
const CAPABILITY: ModelCapability = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: CUSTOM_MAX_OUTPUT } },
  context: { window: CUSTOM_WINDOW },
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
function runTurn(req: ChatRequest): Promise<ChatResult> {
  const run = createCustomByoBackend(DEPS).runChatTurn;
  if (run === undefined) {
    throw new Error("custom-byo backend must implement runChatTurn");
  }
  return run(req);
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
      capturedBody =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
        "data: [DONE]",
      ]);
    });

    await runTurn(
      makeRequest({ customParameters: { reasoning_effort: "high", temperature: 0.2 } }),
    );

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
      capturedBody =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse([
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}',
        "data: [DONE]",
      ]);
    });
    await runTurn(makeRequest({ params: { minP: 0.04 } }));
    expect(capturedBody["min_p"]).toBe(0.04);
  });

  test("a __proto__/constructor-carrying customParameters does not pollute Object.prototype, legit keys still merge (PD-101 Layer 2)", async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedBody =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}', "data: [DONE]"]);
    });

    const poison = JSON.parse(
      '{"reasoning_effort":"high","__proto__":{"polluted":true},"nested":{"constructor":{"polluted":true},"ok":1}}',
    ) as Record<string, unknown>;
    await runTurn(makeRequest({ customParameters: poison }));

    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(capturedBody["polluted"]).toBeUndefined();
    expect(capturedBody["reasoning_effort"]).toBe("high");
    expect(capturedBody["nested"]).toEqual({ ok: 1 });
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
        chatId: "chat-1",
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
    vi.stubGlobal(
      "fetch",
      (): Response =>
        sseResponse([
          'data: {"out":{"text":"mapped "}}',
          'data: {"out":{"text":"hi"},"done":"stop"}',
          "data: [DONE]",
        ]),
    );
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
      capturedBody =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
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
    const chunk = reshapeChunk(
      { choices: [{ delta: { content: "idx" } }] },
      { contentPath: "choices.0.delta.content", reasoningPath: "nope.gone" },
    );
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
    vi.stubGlobal(
      "fetch",
      (): Response =>
        sseResponse(['data: {"error":{"message":"context too long","code":400}}', "data: [DONE]"]),
    );
    await expect(runTurn(makeRequest())).rejects.toBeInstanceOf(ProviderError);
  });

  test("fail-closes on a non-custom_openai credential", async () => {
    const wrongCred = makeOpenRouterCredential();
    await expect(runTurn(makeRequest({ credential: wrongCred }))).rejects.toMatchObject({
      kind: "invalid",
    });
  });
});
