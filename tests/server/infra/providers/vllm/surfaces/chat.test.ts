// Unit tests for the vLLM streaming CHAT surface — drains a fake SSE byte stream through the SHARED kit
// reducer. Asserts: text reply accumulation, `reasoning_content` → the CoT channel, live onDelta dispatch,
// finish-reason + usage mapping, deterministic turn timing (injected `now`), and the per-request sampler
// defaults (presence + repetition) that fill a preset-silent turn. Independent — it only calls
// `client.engineStream`. The agent-sdk fail-close now lives at the composition seam (`vllm/index.test.ts`):
// this surface takes {@link VllmChatRequest}, so the state is unrepresentable here.

import type { ModelCapability } from "@orb/contracts/connection";
import { EFFORT_LEVELS, TURNS_FLOOR } from "@orb/contracts/connection";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { VllmChatRequest } from "@orb/server/infra/providers";
import { createVllmChat } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { makeModelCapability, makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { terminalChunkJson } from "../../../../../support/provider-stream.ts";
import { wireSchema } from "../../../../../support/wire-ready.ts";

const CRED = makeResolvedCredential("vllm");
const MODEL = "Qwen/Qwen3-VL-8B-Instruct" as ModelId;
// The REAL vLLM descriptor shape (`domain/connection` `staticProfile(…, fullSampling: true)` + the arm's
// folded `reasoning` cell), not the factory's empty default. This surface now routes every knob through
// `resolveChat`, which GATES on the descriptor — so a capability that advertises nothing would drop every
// sampler and make these assertions test the funnel's gate instead of the surface's wire. Mirrored here
// rather than imported from `domain/connection` (infra must not learn a domain), and pinned against the real
// resolver by `tests/server/domain/connection/catalog/resolve-model-capability.test.ts`.
const VLLM_SAMPLING = {
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
  logitBias: true,
};
const VLLM_REASONING: ModelCapability["reasoning"] = {
  mode: "effort",
  enabled: true,
  // ERR-OPEN: every level, matching the real descriptor (owner ruling 2026-08-18).
  effortLevels: [...EFFORT_LEVELS],
  defaultEnabled: false,
};
const CAP = makeModelCapability({
  reasoning: VLLM_REASONING,
  sampling: VLLM_SAMPLING,
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 32_768 },
});

// Build a ReadableStream of SSE bytes from raw chunk payloads + the [DONE] sentinel.
function sseStream(payloads: string[]): ReadableStream<Uint8Array> {
  const text = `${payloads.map((p) => `data: ${p}`).join("\n")}\ndata: [DONE]\n`;
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function streamingClient(payloads: string[]): VllmEngineClient {
  return {
    enginePost: () => Promise.reject(new Error("chat must stream, not POST-json")),
    engineStream: () => Promise.resolve(sseStream(payloads)),
    baseUrl: () => "http://127.0.0.1:0",
  };
}

// A 2-call clock: turn start = 1000, settle = 1500 → durationApiMs = 500 (deterministic).
function clock(): () => number {
  const stamps = [1000, 1500];
  let i = 0;
  return () => stamps[Math.min(i++, stamps.length - 1)] ?? 1500;
}

function chatReq(overrides: Partial<VllmChatRequest> = {}): VllmChatRequest {
  return {
    api: "chat-completions",
    credential: CRED,
    model: MODEL,
    capability: CAP,
    params: {},
    systemPrompt: { static: "you are terse", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    ...overrides,
  } satisfies VllmChatRequest;
}

// The body-recording client the sampler/wire assertions share (each test reads `sent.body` after the turn).
function recordingClient(): { client: VllmEngineClient; read: () => Record<string, unknown> | undefined } {
  let body: Record<string, unknown> | undefined;
  return {
    client: {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, sent): Promise<ReadableStream<Uint8Array>> => {
        body = sent as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    },
    read: () => body,
  };
}

describe("createVllmChat", () => {
  test("accumulates the streamed reply + reasoning and maps finish/usage", async () => {
    const client = streamingClient([
      '{"choices":[{"delta":{"content":"Hel"}}]}',
      '{"choices":[{"delta":{"content":"lo"}}]}',
      '{"choices":[{"delta":{"reasoning_content":"thinking"}}]}',
      terminalChunkJson({ usage: { promptTokens: 3, completionTokens: 2 } }),
    ]);
    const deltas: { kind: string; text: string }[] = [];
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(chatReq({ onDelta: (d) => deltas.push({ kind: d.kind, text: d.text }) }));

    expect(res.reply).toBe("Hello");
    expect(res.reasoning).toBe("thinking");
    expect(res.finishReason).toBe("stop");
    expect(res.usage.tokensIn).toBe(3);
    expect(res.usage.tokensOut).toBe(2);
    expect(res.usage.model).toBe(MODEL);
    expect(res.usage.contextWindow).toBe(32_768);
    expect(res.durationApiMs).toBe(500);
    // Live deltas dispatched as they streamed (text + reasoning channels).
    expect(deltas).toContainEqual({ kind: "text", text: "Hel" });
    expect(deltas).toContainEqual({ kind: "reasoning", text: "thinking" });
  });

  // ── D45 wire mapping (the multimodal send this surface owed since the pipeline half landed) ──
  test("a user turn carrying an image part rides the wire as a content-part ARRAY with image_url (D45)", async () => {
    const rec = recordingClient();
    const chat = createVllmChat({ client: rec.client, now: clock() });
    await chat(
      chatReq({
        history: [
          {
            role: "user",
            content: [
              { type: "text", text: "what is this?" },
              { type: "image", url: "data:image/png;base64,AAAA" },
            ],
          },
        ],
      }),
    );
    const messages = rec.read()?.["messages"] as { role: string; content: unknown }[];
    const user = messages.find((m) => m.role === "user");
    expect(user?.content).toEqual([
      { type: "text", text: "what is this?" },
      // biome-ignore lint/style/useNamingConvention: the OpenAI-compatible multimodal wire field name.
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });

  test("a video part rides as video_url — vLLM's multimodal extension, sampled by the engine's launch kwargs (#317)", async () => {
    const rec = recordingClient();
    const chat = createVllmChat({ client: rec.client, now: clock() });
    await chat(
      chatReq({
        history: [
          {
            role: "user",
            content: [
              { type: "text", text: "watch this" },
              { type: "video", url: "data:video/mp4;base64,BBBB" },
            ],
          },
        ],
      }),
    );
    const messages = rec.read()?.["messages"] as { role: string; content: unknown }[];
    const user = messages.find((m) => m.role === "user");
    expect(user?.content).toEqual([
      { type: "text", text: "watch this" },
      // biome-ignore lint/style/useNamingConvention: the OpenAI-compatible multimodal wire field name.
      { type: "video_url", video_url: { url: "data:video/mp4;base64,BBBB" } },
    ]);
  });

  test("a text-only user turn stays PLAIN-STRING content (byte-stable — prefix caches key on it)", async () => {
    const rec = recordingClient();
    const chat = createVllmChat({ client: rec.client, now: clock() });
    await chat(chatReq());
    const messages = rec.read()?.["messages"] as { role: string; content: unknown }[];
    const user = messages.find((m) => m.role === "user");
    expect(user?.content).toBe("hi");
  });

  test("emits min_p in the wire body when the user set minP (D68-A)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { minP: 0.03 } }));
    expect(sentBody?.["min_p"]).toBe(0.03);
  });

  test("no min_p field when the user did not set minP (byte-stable)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(sentBody).not.toHaveProperty("min_p");
  });

  // STRICTFMT: guided decoding is an ENFORCING wire — `strict:true` is the xgrammar populate lever (an 8B
  // skips optionals unless the grammar REQUIRES them). The shared kit builder no longer invents a default, so
  // this surface PINS it; losing the pin silently downgrades every structured vLLM call to unenforced JSON.
  test("pins strict:true on response_format when the caller is silent (guided decoding is the enforcing wire)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ responseFormat: { name: "extract", schema: wireSchema({ type: "object" }) } }));
    expect(sentBody?.["response_format"]).toEqual({
      type: "json_schema",
      // biome-ignore lint/style/useNamingConvention: the OpenAI-compatible `response_format` wire field name.
      json_schema: { name: "extract", schema: { type: "object" }, strict: true },
    });
  });

  test("an EXPLICIT strict:false from the caller still wins over the vLLM pin", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ responseFormat: { name: "extract", schema: wireSchema({}), strict: false } }));
    expect(sentBody?.["response_format"]).toEqual({
      type: "json_schema",
      // biome-ignore lint/style/useNamingConvention: the OpenAI-compatible `response_format` wire field name.
      json_schema: { name: "extract", schema: {}, strict: false },
    });
  });

  test("wires max_tokens = DEFAULT_MAX_OUTPUT_TOKENS when unset (the response-length default, NOT the window)", async () => {
    // The amnesia coupling: the runner's fallback must be a sane response length, never the window — and it
    // must equal the budget's reserve fallback (both `DEFAULT_MAX_OUTPUT_TOKENS`). A concrete-materialized
    // intent (the chat path) sets it explicitly; this pins the non-chat fallback.
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(sentBody?.["max_tokens"]).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  test("wires the explicit maxOutputTokens as max_tokens (the reserve == runner max_tokens coupling)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { maxOutputTokens: 512 } }));
    expect(sentBody?.["max_tokens"]).toBe(512);
  });

  // ── item 7: the per-request presence-penalty default (engineLaunch.genPresencePenalty). Verified by the
  // WIRE BODY only — never a live vLLM request (engines are up; launcher/request-firing is banned). ──
  test("applies the card-default presence_penalty (0.0) when the preset is silent and no getter is injected", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(sentBody?.["presence_penalty"]).toBe(0.0);
  });

  test("applies the INJECTED genPresencePenalty default when the preset is silent (admin retune, per request)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock(), genPresencePenalty: () => 0.3 });
    await chat(chatReq({ params: {} }));
    expect(sentBody?.["presence_penalty"]).toBe(0.3);
  });

  test("a preset's explicit presencePenalty WINS over the admin default", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream([terminalChunkJson()]));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock(), genPresencePenalty: () => 0.3 });
    await chat(chatReq({ params: { presencePenalty: 1.9 } }));
    expect(sentBody?.["presence_penalty"]).toBe(1.9);
  });

  test("forwards the chatId on each delta", async () => {
    // The terminal rides the content chunk (every other fixture in this file already carries one): the
    // subject here is delta FORWARDING, and a stream that never terminated is refused outright by the #1400
    // truncation fence — so a terminal-less fixture would be asserting the truncated shape by accident.
    const client = streamingClient([terminalChunkJson({ delta: { content: "x" } })]);
    const seen: ChatId[] = [];
    const chat = createVllmChat({ client, now: clock() });
    await chat(
      chatReq({
        chatId: castId<ChatId>("chat_123"),
        onDelta: (d) => seen.push(d.chatId),
      }),
    );

    expect(seen[0]).toBe(castId<ChatId>("chat_123"));
  });

  // ── the per-request REPETITION-penalty default (engineLaunch.genRepetitionPenalty). This value used to be
  // baked into the serve command as `--override-generation-config` — a second home that outranked the
  // checkpoint's own generation_config.json on every request, kept alive only by the retired sampler-less
  // agent-sdk /v1/messages wire. Preset FIRST, admin default fills the silence, 1.0 (no-op) when neither. ──
  test("a preset's repetition_penalty reaches the wire body verbatim (preset params are the first authority)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock(), genRepetitionPenalty: () => 1.05 });
    await chat(chatReq({ params: { repetitionPenalty: 1.2 } }));
    expect(read()?.["repetition_penalty"]).toBe(1.2);
  });

  test("applies the INJECTED genRepetitionPenalty default when the preset is silent (admin retune, per request, no restart)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock(), genRepetitionPenalty: () => 1.05 });
    await chat(chatReq({ params: {} }));
    expect(read()?.["repetition_penalty"]).toBe(1.05);
  });

  test("re-reads the getter per request — an admin retune governs the NEXT turn with no restart", async () => {
    const { client, read } = recordingClient();
    let value = 1.05;
    const chat = createVllmChat({ client, now: clock(), genRepetitionPenalty: () => value });
    await chat(chatReq({ params: {} }));
    expect(read()?.["repetition_penalty"]).toBe(1.05);
    value = 1.15;
    await chat(chatReq({ params: {} }));
    expect(read()?.["repetition_penalty"]).toBe(1.15);
  });

  test("falls back to the 1.0 no-op when neither the preset nor a getter supplies one", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(read()?.["repetition_penalty"]).toBe(1.0);
  });
});

// ── THE THINKING KNOBS (#197). The gen slot serves a THINKING checkpoint behind our vendored fixed chat
// template, whose per-request variables are `enable_thinking` + `reasoning_effort` and whose override door is
// `chat_template_kwargs` (the same map the launch's `--default-chat-template-kwargs` supplies defaults for).
// Before #197 this surface read `req.params` RAW: no funnel, no capability gate, and NO path at all from a
// preset's reasoning dial to the wire — the knobs existed in `UserIntent` and died at this file. ──
// Read the wire body's template-kwargs map as a plain record. Index access, never an object literal: the
// wire vocabulary is snake_case and a literal declaration of those keys is a `useNamingConvention` violation
// in the test tree (the production file spells them once, where the wire contract lives).
function templateKwargs(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return body?.["chat_template_kwargs"] as Record<string, unknown> | undefined;
}

describe("createVllmChat — reasoning (the per-request thinking door)", () => {
  test("a preset effort rides as chat_template_kwargs — the ONLY door that can beat the baked enable_thinking:false", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { effort: "low" } }));
    // Both fields, one map: `reasoning_effort` alone cannot turn thinking on — the launch bakes
    // enable_thinking:false, which short-circuits the template's reasoning branch before any effort is read.
    const ctk = templateKwargs(read());
    expect(ctk?.["enable_thinking"]).toBe(true);
    expect(ctk?.["reasoning_effort"]).toBe("low");
  });

  test("our `max` maps to the wire's `xhigh` — the level vocab is effortToOpenAIReasoning's, never re-spelled", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { effort: "max" } }));
    expect(templateKwargs(read())?.["reasoning_effort"]).toBe("xhigh");
  });

  test("effort:'none' emits NO template kwargs — the off-switch leaves the body byte-identical to a pre-thinking turn", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { effort: "none" } }));
    expect(read()).not.toHaveProperty("chat_template_kwargs");
  });

  test("a SILENT preset does not start the model thinking (descriptor is defaultEnabled:false)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(read()).not.toHaveProperty("chat_template_kwargs");
  });

  // ERR-OPEN + honest translation (owner ruling 2026-08-18). `minimal` IS offered — the descriptor does not
  // withhold a level to protect the user from a surprise. The template's ladder does not know `minimal` and
  // its else-branch would fold it UP to `xhigh` (maximum thinking for the user who asked for the least), so
  // the wire projection lands it on the template's real floor instead. The knob stays available AND the
  // direction of intent is preserved — the pairing is the whole point, so pin both halves.
  test("`minimal` is OFFERED and lands on the template's floor — never dropped, never folded up to xhigh", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(chatReq({ params: { effort: "minimal" } }));
    expect(templateKwargs(read())?.["reasoning_effort"]).toBe("low");
    expect(templateKwargs(read())?.["enable_thinking"]).toBe(true);
    // Offered, so nothing was degraded — an err-open level must not warn.
    expect(res.events).not.toContainEqual(expect.objectContaining({ code: "effort_dropped" }));
  });

  // This wire has NO per-request reasoning-token budget: that mechanism needs a `--reasoning-config` BOOT flag
  // `genArgv` deliberately does not emit. An effort-mode model used to swallow a budget in SILENCE (only the
  // adaptive arm warned) — D41 says a drop is visible or it is a bug.
  test("thinkingBudgetTokens drops LOUD on this effort-mode wire and never reaches the body", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(chatReq({ params: { effort: "low", thinkingBudgetTokens: 4096 } }));
    const body = read();
    expect(body).not.toHaveProperty("thinking_token_budget");
    // …and the effort still rides: the budget's drop must not take the knob that DOES work with it.
    expect(templateKwargs(body)?.["reasoning_effort"]).toBe("low");
    expect(res.events).toContainEqual(
      expect.objectContaining({ kind: "warning", code: "sampling_knob_dropped", message: expect.stringContaining("reasoning budget ignored") }),
    );
  });

  // The funnel is genuinely in the path now — proven by a CLAMP, which the old raw-forward could not do.
  test("a sampler beyond the descriptor's range is CLAMPED (proof the resolveChat funnel really runs)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { temperature: 9 } }));
    expect(read()?.["temperature"]).toBe(2);
  });
});

// ── THE PREFILL DOOR (#287, 2026-08-19) ─────────────────────────────────────────────────────────────
// On this wire a delivered trailing-assistant row is NOT self-executing: the vendored template closes it and
// appends a fresh assistant header unless the request carries `continue_final_message` + a false
// `add_generation_prompt` (both /tokenize arms measured on the gen engine — receipts on `VLLM_TURNS`). So the
// capability flip is only half the feature; these pin the half that lives here.
const PREFILL_CAP = makeModelCapability({
  reasoning: VLLM_REASONING,
  sampling: VLLM_SAMPLING,
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 32_768 },
  turns: { ...TURNS_FLOOR, assistantPrefill: true, roleHandlingFloor: "none" },
});
const NO_PREFILL_CAP = makeModelCapability({
  reasoning: VLLM_REASONING,
  sampling: VLLM_SAMPLING,
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 32_768 },
  turns: { ...TURNS_FLOOR },
});
const assistantTail = (text: string): VllmChatRequest["history"] => [
  { role: "user", content: [{ type: "text", text: "tell me about the rain" }] },
  { role: "assistant", content: [{ type: "text", text }] },
];

describe("createVllmChat — the assistant-prefill continuation pair", () => {
  test("a delivered assistant tail on a prefill-capable model sends the PAIR (continue + no generation prompt)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ capability: PREFILL_CAP, history: assistantTail("The rain fell") }));
    expect(read()?.["continue_final_message"]).toBe(true);
    expect(read()?.["add_generation_prompt"]).toBe(false);
  });

  // The common arm, and the one that must stay byte-identical: SHAPE's ends-on-user invariant means almost
  // every turn lands here, and a stray pair would fold the next turn into the previous message.
  test("a user tail sends NEITHER flag, even on a prefill-capable model", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ capability: PREFILL_CAP }));
    expect(read()).not.toHaveProperty("continue_final_message");
    expect(read()).not.toHaveProperty("add_generation_prompt");
  });

  // The descriptor is the authority (D143 — capability here varies per CHECKPOINT): a model whose cell says
  // the template cannot continue must not get the pair, whatever the array shape says.
  test("a capability that does NOT honor prefill sends neither flag on the same assistant tail", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ capability: NO_PREFILL_CAP, history: assistantTail("The rain fell") }));
    expect(read()).not.toHaveProperty("continue_final_message");
  });

  // MEASURED 2026-08-19 (two seed-pinned live completions): flags + thinking returns `content: null` with the
  // whole continuation in `reasoning_content` — an empty reply. The prefill wins and the drop is LOUD (D41).
  test("a CONTENT prefill drops the thinking kwargs, loudly, and keeps the continuation", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(chatReq({ capability: PREFILL_CAP, history: assistantTail("The rain fell"), params: { effort: "low" } }));
    expect(read()).not.toHaveProperty("chat_template_kwargs");
    expect(read()?.["continue_final_message"]).toBe(true);
    expect(res.events).toContainEqual(expect.objectContaining({ kind: "warning", code: "reasoning_dropped_for_prefill" }));
  });

  // The OTHER door the vendored template was built for: a prefill that leaves `<think>` OPEN is a thinking
  // STEER, the parser's reasoning-first assumption is correct, and the kwargs must ride untouched.
  test("an OPEN-think prefill keeps the thinking kwargs (the steer door) and never warns", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(
      chatReq({ capability: PREFILL_CAP, history: assistantTail("<think>\nStay terse — the strangest thing I saw was"), params: { effort: "low" } }),
    );
    expect(templateKwargs(read())?.["enable_thinking"]).toBe(true);
    expect(read()?.["continue_final_message"]).toBe(true);
    expect(res.events).not.toContainEqual(expect.objectContaining({ code: "reasoning_dropped_for_prefill" }));
  });

  // A CLOSED think block followed by prose is a content prefill, not a steer — last-index, never a count.
  test("a closed think block followed by prose is CONTENT (thinking still drops)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ capability: PREFILL_CAP, history: assistantTail("<think>\nbrief\n</think>\n\nThe rain fell"), params: { effort: "low" } }));
    expect(read()).not.toHaveProperty("chat_template_kwargs");
  });
});

// ── customParameters ON the LOCAL engine — owner word 2026-08-18, AMENDING the 2026-07-24 BYOK-only
// ruling of commit 20ac4154c). vLLM JOINS the escape hatch: capability here varies per checkpoint and is not
// reliably detectable, so the posture is trust-the-user, err open, and let the engine refuse. OpenRouter's
// lock is unchanged. Two tiers protect the turn — PRECEDENCE for everything we model, and the BELT DENYLIST
// for what infra owns; the denylist is the only hard fence, so it gets the heaviest pinning. ──
// Vendor-spelled blobs, built from ENTRIES rather than object literals: these are deliberately snake_case
// engine field names (the exact shape a user reaches for) and literal keys would violate useNamingConvention.
const TEXTGEN_BLOB: Record<string, unknown> = Object.fromEntries([
  ["mirostat_mode", 2],
  ["dry_multiplier", 0.8],
]);

describe("createVllmChat — customParameters reaches the wire (the 2026-08-18 amendment)", () => {
  test("an exotic sampler the modeled surface does not carry rides through to the body", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(chatReq({ customParameters: TEXTGEN_BLOB }));
    const body = read();
    expect(body?.["mirostat_mode"]).toBe(2);
    expect(body?.["dry_multiplier"]).toBe(0.8);
    // Nothing was dropped, so nothing warns — the blob is no longer a degrade on this source.
    expect(res.events).not.toContainEqual(expect.objectContaining({ code: "custom_parameters_ignored" }));
  });

  test("an absent blob leaves the body byte-identical (every preset today takes this path)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { temperature: 0.7 } }));
    const withoutBlob = read();
    await chat(chatReq({ params: { temperature: 0.7 }, customParameters: {} }));
    expect(read()).toEqual(withoutBlob);
  });

  // PRECEDENCE — the modeled knob wins. `temperature` is capability-gated and clamped by the funnel; the
  // escape hatch EXTENDS the wire, it does not re-litigate a value the funnel already decided. This is the
  // OPPOSITE of custom-byo, where the user's endpoint makes customParameters the final word.
  test("a modeled param WINS over a customParameters key of the same name", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { temperature: 0.4 }, customParameters: Object.fromEntries([["temperature", 1.9]]) }));
    expect(read()?.["temperature"]).toBe(0.4);
  });

  test("the reasoning kwargs also win — the escape hatch cannot rewrite the resolved thinking door", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(
      chatReq({
        params: { effort: "low" },
        customParameters: Object.fromEntries([["chat_template_kwargs", Object.fromEntries([["enable_thinking", false]])]]),
      }),
    );
    expect(templateKwargs(read())?.["enable_thinking"]).toBe(true);
    expect(templateKwargs(read())?.["reasoning_effort"]).toBe("low");
  });
});

// THE BELT DENYLIST is the ONLY hard fence on this source now (err-open posture), so each key is pinned.
// `truncate_prompt_tokens` is the one that earned it: #165/#173 measured it turning a 21ms honest 400 into an
// unbounded hang that burned 120s timeouts in production, and it was removed from the embed + rerank surfaces
// at the cost of two incidents. A preset must not be able to put it back.
describe("createVllmChat — the belt denylist (the one hard fence)", () => {
  // The last two joined 2026-08-19 with the assistant-prefill flip: the surface decides the continuation pair
  // from the capability + the delivered tail, and on the no-prefill arm it emits NEITHER key — so precedence
  // has nothing to collide with and a preset value would ride unopposed into a broken render.
  const beltKeys = [
    "truncate_prompt_tokens",
    "truncation_side",
    "stream",
    "stream_options",
    "model",
    "messages",
    "continue_final_message",
    "add_generation_prompt",
  ];

  for (const key of beltKeys) {
    test(`\`${key}\` is DROPPED from customParameters and the drop is loud`, async () => {
      const { client, read } = recordingClient();
      const chat = createVllmChat({ client, now: clock() });
      const res = await chat(chatReq({ customParameters: Object.fromEntries([[key, "belt-owned-poison"]]) }));
      expect(read()?.[key]).not.toBe("belt-owned-poison");
      expect(res.events).toContainEqual(expect.objectContaining({ kind: "warning", code: "custom_parameters_ignored", message: expect.stringContaining(key) }));
    });
  }

  test("the hang knob cannot be re-added even alongside legitimate keys (partial drop keeps the rest)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(
      chatReq({
        customParameters: Object.fromEntries([
          ["truncate_prompt_tokens", -1],
          ["mirostat_mode", 2],
        ]),
      }),
    );
    const body = read();
    expect(body).not.toHaveProperty("truncate_prompt_tokens");
    // …and the legitimate key still rides: a partial drop must not throw away the whole blob.
    expect(body?.["mirostat_mode"]).toBe(2);
    expect(res.events).toContainEqual(
      expect.objectContaining({ code: "custom_parameters_ignored", message: expect.stringContaining("truncate_prompt_tokens") }),
    );
  });

  test("the transport shape survives a blob that tries to unset streaming", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ customParameters: Object.fromEntries([["stream", false]]) }));
    expect(read()?.["stream"]).toBe(true);
  });

  test("the belt drop also fires on `onEvent`, not only on the result", async () => {
    const { client } = recordingClient();
    const seen: string[] = [];
    const chat = createVllmChat({ client, now: clock() });
    await chat(
      chatReq({
        customParameters: Object.fromEntries([["truncate_prompt_tokens", -1]]),
        onEvent: (e) => seen.push(e.kind === "warning" ? e.code : e.kind),
      }),
    );
    expect(seen).toContain("custom_parameters_ignored");
  });

  // THE MID-TURN SYSTEM ROW ON THE WIRE (#201). A FENCE, not a defect proof: this surface already passes
  // `system` through (`HISTORY_ROLES` carries it and `toMessages` maps `turn.role` verbatim) — the demote
  // that hid it happened upstream in SHAPE. The fence is what makes the two halves one provable path: SHAPE
  // now emits the row at its depth (`shape.test.ts`), and this pins that the surface delivers it AT THAT
  // INDEX rather than hoisting it into the head system message — the hoist being exactly what most
  // chat-completions clients do, and what the /tokenize probe proved this template does not need.
  test("a MID-ARRAY system history row reaches the body at its position (never hoisted into the head prompt)", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(
      chatReq({
        history: [
          { role: "user", content: [{ type: "text", text: "u1" }] },
          { role: "assistant", content: [{ type: "text", text: "a1" }] },
          { role: "system", content: [{ type: "text", text: "GM note" }] },
          { role: "user", content: [{ type: "text", text: "u2" }] },
        ],
      }),
    );
    expect(read()?.["messages"]).toEqual([
      { role: "system", content: "you are terse" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "system", content: "GM note" },
      { role: "user", content: "u2" },
    ]);
  });

  // The Layer-2 prototype-pollution belt (`server/kit/custom-parameters.deepMergeRequestBody`) must still be
  // in the path — routing through it rather than spreading is what keeps the two-layer defense real.
  test("prototype-pollution keys are neutralized by the merge belt", async () => {
    const { client, read } = recordingClient();
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ customParameters: Object.fromEntries([["__proto__", Object.fromEntries([["polluted", true]])]]) }));
    expect(read()).not.toHaveProperty("polluted");
    // …and no OTHER object gained the key — the real proof that the global prototype was never touched.
    const bystander: Record<string, unknown> = {};
    expect(Object.hasOwn(bystander, "polluted")).toBe(false);
    expect(bystander["polluted"]).toBeUndefined();
  });
});
