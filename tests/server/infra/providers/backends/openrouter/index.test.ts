// backends/openrouter index — the family barrel factory: the backend `key`, the role surface it exposes
// (NO runAgentTurn), the credential firewall (a wrong source fail-closes), the api guard (agent-sdk is
// rejected), the `getClient` injection (resolves the credential's API key), and the summarize shaper (a
// sequential per-input chat turn with `<think>` stripped). The SDK client is a hand-built fake.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { ChatRequest, EmbedRequest, ProviderBackend, StructuredRequest, SummarizeRequest, SummarizeResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { OrClient } from "@orb/server/infra/providers/backends/openrouter";
import { createOpenRouterBackend } from "@orb/server/infra/providers/backends/openrouter";
import { describe, vi } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const FIXED_NOW = 1000;
const OR_KEY = "sk-or-secret";
const CRED = {
  source: "openrouter",
  apiKey: OR_KEY,
  credentialId: null,
} as unknown as ResolvedCredential;

// A summarize chat reply carrying CoT scaffolding the shaper must strip.
function summarizeReply(content: string): unknown {
  return {
    choices: [{ message: { content }, finishReason: "stop", index: 0 }],
    created: 0,
    id: "g",
    model: "m",
    object: "chat.completion",
    systemFingerprint: null,
    usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7, cost: 0.001 },
  };
}

// A structured reply the way a FORCED TOOL CALL comes back: no prose content, the payload in the call's
// `arguments` string (the SDK's camelCase `toolCalls` shape).
function toolCallReply(name: string, args: string): unknown {
  return {
    choices: [
      {
        message: { content: null, toolCalls: [{ id: "call_1", type: "function", function: { name, arguments: args } }] },
        finishReason: "tool_calls",
        index: 0,
      },
    ],
    created: 0,
    id: "g",
    model: "m",
    object: "chat.completion",
    systemFingerprint: null,
    usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7, cost: 0.001 },
  };
}

interface Tracker {
  apiKeys: string[];
  sends: number;
  /** Each `chat.send` argument (`{ chatRequest }`) — so a test can assert what the shaper put on the wire. */
  sentRequests: unknown[];
}

// A backend wired with an injected `getClient` that records the API key it was handed and returns a fake
// whose chat.send replies (non-streaming) for the summarize shaper. `reply` may THROW (return a rejecting
// promise) to exercise the failure-observability path. `captureWire` opts in the wire-capture sink.
function backendWith(
  reply: (n: number) => unknown,
  captureWire?: Parameters<typeof createOpenRouterBackend>[0]["captureWire"],
): {
  backend: ProviderBackend;
  tracker: Tracker;
} {
  const tracker: Tracker = { apiKeys: [], sends: 0, sentRequests: [] };
  const getClient = (apiKey: string): OrClient => {
    tracker.apiKeys.push(apiKey);
    return {
      chat: {
        send: (arg: unknown): Promise<unknown> => {
          tracker.sends += 1;
          tracker.sentRequests.push(arg);
          return Promise.resolve(reply(tracker.sends));
        },
      },
    } as unknown as OrClient;
  };
  const backend = createOpenRouterBackend({
    now: (): number => FIXED_NOW,
    getClient,
    ...(captureWire !== undefined ? { captureWire } : {}),
  });
  return { backend, tracker };
}

// Pull the optional summarize method through a typed helper so the await is unambiguously on a Promise.
function callSummarize(backend: ProviderBackend, req: SummarizeRequest): Promise<SummarizeResult> {
  const fn = backend.summarize;
  if (fn === undefined) {
    throw new Error("openrouter backend must implement summarize");
  }
  return fn(req);
}

// The `structured` role method (owner ruling 2026-07-27 — split from summarize; `responseFormat` required).
function callStructured(backend: ProviderBackend, req: StructuredRequest): Promise<SummarizeResult> {
  const fn = backend.structured;
  if (fn === undefined) {
    throw new Error("openrouter backend must implement structured");
  }
  return fn(req);
}

describe("createOpenRouterBackend — surface", () => {
  test("registers under key 'openrouter' and serves chat + the non-chat roles, NOT agent", () => {
    const { backend } = backendWith(() => summarizeReply("x"));
    expect(backend.key).toBe("openrouter");
    expect(backend.runChatTurn).toBeDefined();
    expect(backend.embed).toBeDefined();
    expect(backend.rerank).toBeDefined();
    expect(backend.imageEmbed).toBeDefined();
    expect(backend.summarize).toBeDefined();
    expect(backend.generateImage).toBeDefined();
    expect(backend.runAgentTurn).toBeUndefined();
  });
});

describe("createOpenRouterBackend — firewall + dispatch", () => {
  test("the agent-sdk api is rejected (that api is the agent-sdk backend's)", async () => {
    const { backend } = backendWith(() => summarizeReply("x"));
    const req = {
      api: "agent-sdk",
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-opus-4-5"),
      prompt: "hi",
    } as unknown as ChatRequest;
    await expect(backend.runChatTurn?.(req)).rejects.toMatchObject({ kind: "invalid" });
  });

  test("a non-openrouter credential fail-closes the credential guard (rejected, not sync-thrown)", async () => {
    const { backend } = backendWith(() => summarizeReply("x"));
    const vllmCred = makeResolvedCredential("vllm");
    const req: EmbedRequest = {
      credential: vllmCred,
      model: castId<ModelId>("qwen/embed"),
      input: "x",
    };
    await expect(backend.embed?.(req)).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("createOpenRouterBackend — summarize shaper", () => {
  test("runs one chat turn per input (sequentially), strips <think>, maps usage + model", async () => {
    const { backend, tracker } = backendWith((n) => summarizeReply(`<think>cot${n}</think>S${n}`));
    const req: SummarizeRequest = {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [
        { systemPrompt: "sys", userPrompt: "one" },
        { systemPrompt: "sys", userPrompt: "two" },
      ],
    };
    const result = await callSummarize(backend, req);
    expect(tracker.sends).toBe(2); // one chat turn per input
    expect(tracker.apiKeys).toContain(OR_KEY); // the credential's key was resolved + handed to getClient
    expect(result?.items.map((item) => item.text)).toEqual(["S1", "S2"]); // CoT stripped
    expect(result?.items[0]?.usage).toEqual({ tokensIn: 5, tokensOut: 2, costUsd: 0.001 });
    expect(result?.model).toBe("anthropic/claude-haiku-4-5");
  });

  // ── THE STRUCTURED VEHICLE IS A FORCED TOOL CALL, NOT `response_format` (RESYNC-OR, live-probed) ──
  // `response_format: json_schema` is NOT servable across OpenRouter's hosted families. Measured against the
  // REAL rpg extraction schema on 2026-08-02 (`anthropic/claude-sonnet-5` is the owner's default hosted model):
  //   • anthropic  — 400 on `strict:true` AND `strict:false`: first "For 'integer' type, properties maximum,
  //     minimum are not supported", then (bounds stripped) "Schemas contains too many optional parameters (46)".
  //   • openai     — 400 on `strict:true` ("'required' is required to be supplied"); 200 only non-strict.
  //   • google     — 200 on both.
  // A FORCED TOOL CALL carrying the same JSON Schema is 200 on ALL THREE. That is why the structured role
  // sends `tools:[…] + tool_choice:{function}` and reads the call's `arguments` — the vehicle the in-turn
  // folded round already proved on this wire (D112). The host `resyncFromStory` door died on exactly this.
  test("STRUCTURED rides a FORCED TOOL CALL carrying the schema — never response_format", async () => {
    const { backend, tracker } = backendWith((n) => summarizeReply(`S${n}`));
    const schema = {
      type: "object",
      properties: { genre: { type: "string" } },
      required: ["genre"],
    };
    await callStructured(backend, {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [{ systemPrompt: "sys", userPrompt: "one" }],
      responseFormat: { name: "result", schema },
    });
    const sent = tracker.sentRequests[0] as { chatRequest?: { responseFormat?: unknown; tools?: unknown; toolChoice?: unknown } };
    // The schema rides ONE tool named for the format, and the model is FORCED onto it (never `auto` — a
    // structured call that came back as prose is a failed extraction, not a stylistic choice).
    expect(sent.chatRequest?.tools).toEqual([{ type: "function", function: { name: "result", description: expect.any(String), parameters: schema } }]);
    expect(sent.chatRequest?.toolChoice).toEqual({ type: "function", function: { name: "result" } });
    // …and `response_format` is GONE: sending both is what 400s on anthropic.
    expect(sent.chatRequest?.responseFormat).toBeUndefined();
  });

  test("STRUCTURED reads the JSON out of the forced tool call's arguments", async () => {
    const args = '{"genre":"noir"}';
    const { backend } = backendWith(() => toolCallReply("result", args));
    const result = await callStructured(backend, {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [{ systemPrompt: "sys", userPrompt: "one" }],
      responseFormat: { name: "result", schema: { type: "object" } },
    });
    expect(result?.items[0]?.text).toBe(args);
  });

  // S3 — the structured role does NOT strip `<think>`: a literal `<think>…</think>` inside a JSON string value
  // (constrained output — e.g. journal content quoting the tag) is legitimate and must survive; stripping it
  // would corrupt the JSON / lose content. The prose (summarize) role still strips (pinned above).
  test("S3: a literal <think> inside a structured JSON string value SURVIVES (no strip on the structured role)", async () => {
    const jsonWithThink = '{"journal":[{"type":"note","content":"He said <think>plan</think> aloud."}]}';
    const { backend } = backendWith(() => summarizeReply(jsonWithThink));
    const result = await callStructured(backend, {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [{ systemPrompt: "sys", userPrompt: "one" }],
      responseFormat: { name: "result", schema: { type: "object" } },
    });
    expect(result?.items[0]?.text).toBe(jsonWithThink); // <think> preserved verbatim
    expect(() => JSON.parse(result?.items[0]?.text ?? "")).not.toThrow(); // JSON intact
  });

  test("omits response_format entirely when no jsonSchema is supplied (byte-identical to pre-change)", async () => {
    const { backend, tracker } = backendWith((n) => summarizeReply(`S${n}`));
    await callSummarize(backend, {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [{ systemPrompt: "sys", userPrompt: "one" }],
    });
    const sent = tracker.sentRequests[0] as { chatRequest?: { responseFormat?: unknown } };
    expect(sent.chatRequest?.responseFormat).toBeUndefined();
  });

  test("a text-only item keeps a plain-string user content (byte-unchanged from the text-only turn)", async () => {
    const { backend, tracker } = backendWith((n) => summarizeReply(`S${n}`));
    await callSummarize(backend, {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [{ systemPrompt: "sys", userPrompt: "one" }],
    });
    // No images ⇒ the user message content is the raw string, NOT a single-element content-part array —
    // the hosted request wire is identical to before the multimodal arm landed.
    const sent = tracker.sentRequests[0] as { chatRequest: { messages: { role: string; content: unknown }[] } };
    expect(sent.chatRequest.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "one" },
    ]);
  });

  test("an item with images → a multimodal user content: the instruction text first, then image_url parts in order", async () => {
    const { backend, tracker } = backendWith((n) => summarizeReply(`S${n}`));
    // A raw-bytes image (→ png data URL) and a string image (→ URL passthrough), in this order.
    const bytes = Uint8Array.from([1, 2, 3]);
    await callSummarize(backend, {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [{ systemPrompt: "sys", userPrompt: "describe", images: [bytes, "https://cdn.example/a.jpg"] }],
    });
    const sent = tracker.sentRequests[0] as { chatRequest: { messages: { role: string; content: unknown }[] } };
    // The system message is untouched (plain string); only the user turn goes multimodal.
    expect(sent.chatRequest.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(sent.chatRequest.messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image_url", imageUrl: { url: "data:image/png;base64,AQID" } },
        { type: "image_url", imageUrl: { url: "https://cdn.example/a.jpg" } },
      ],
    });
  });
});

// OBSERVABILITY parity with the vLLM summarize surface (the black-hole fix): the OR summarize path captures
// the wire body + emits a per-item provider.summarize-item turn log for BOTH success and failure.
describe("createOpenRouterBackend — summarize observability (wire capture + provider.summarize-item log)", () => {
  const haikuModel = castId<ModelId>("anthropic/claude-haiku-4-5");

  test("captures the outbound-schema'd wire body per item under the 'summarize' api tag", async () => {
    const captured: { api: string; backend: string; model: string; body: Record<string, unknown> }[] = [];
    const { backend } = backendWith(
      (n) => summarizeReply(`S${n}`),
      (e) => captured.push({ api: e.api, backend: e.backend, model: e.model, body: e.body }),
    );
    await callSummarize(backend, {
      credential: CRED,
      model: haikuModel,
      inputs: [
        { systemPrompt: "sys", userPrompt: "a" },
        { systemPrompt: "sys", userPrompt: "b" },
      ],
    });
    expect(captured).toHaveLength(2);
    expect(captured.map((c) => c.api)).toEqual(["summarize", "summarize"]);
    expect(captured.map((c) => c.backend)).toEqual(["openrouter", "openrouter"]);
    // The captured body is the snake_case wire the SDK actually sends.
    expect(captured[0]?.body["model"]).toBe(haikuModel);
    expect(captured[0]?.body["messages"]).toBeDefined();
  });

  test("emits provider.summarize-item ok:true per item with tokens + finishReason + responseFormat presence", async () => {
    const spy = vi.spyOn(logger, "info");
    const { backend } = backendWith((n) => summarizeReply(`S${n}`));
    await callStructured(backend, {
      credential: CRED,
      model: haikuModel,
      inputs: [{ systemPrompt: "sys", userPrompt: "a" }],
      responseFormat: { name: "rpg_state", schema: { type: "object" } },
    });
    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.structured-item");
    expect(line).toBeDefined();
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["backend"]).toBe("openrouter");
    expect(fields["ok"]).toBe(true);
    expect(fields["index"]).toBe(0);
    expect(fields["tokensIn"]).toBe(5);
    expect(fields["tokensOut"]).toBe(2);
    expect(fields["finishReason"]).toBe("stop");
    expect(fields["hasResponseFormat"]).toBe(true);
  });

  test("emits provider.summarize-item ok:false with errorKind on a failing item — and still re-throws", async () => {
    const spy = vi.spyOn(logger, "warn");
    const { backend } = backendWith(() => {
      throw new ProviderError({ kind: "rate_limit", retryable: true, message: "429" });
    });
    await expect(callSummarize(backend, { credential: CRED, model: haikuModel, inputs: [{ systemPrompt: "sys", userPrompt: "a" }] })).rejects.toBeInstanceOf(
      ProviderError,
    );
    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.summarize-item");
    expect(line).toBeDefined();
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["ok"]).toBe(false);
    expect(fields["errorKind"]).toBe("rate_limit");
  });
});
