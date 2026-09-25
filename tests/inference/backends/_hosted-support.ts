// tests/inference/backends/_hosted-support — the shared fixtures for the two HOSTED wires' turn tests: a
// generation capability, and a fake `fetch` that answers with a REAL provider SSE stream (Anthropic Messages
// events / OpenAI-compatible chat chunks) while recording the request bodies.
//
// The turn is driven end to end through the SDK provider rather than a hand-rolled `LanguageModelV4` fake,
// because the assertion that matters for the reasoning-replay contract is WHAT THE MODEL RECEIVES — the
// converted wire body — and only the real converter produces that. A model-level fake would pin our prompt
// shape and prove nothing about the `thinking` / `reasoning_details` block the provider actually emits.

import type { Capability, GenerationCapability } from "@orb/contracts/inference";

export interface SseEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

/** A recorded outbound request: the parsed JSON body plus the URL it went to, and (when the recorder saw them)
 *  the request headers, keys lowercased. */
export interface RecordedRequest {
  readonly url: string;
  readonly body: Record<string, unknown>;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

function sseBody(events: readonly SseEvent[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
}

/** A `fetch` that answers each call with the next scripted SSE stream and records what was sent. */
export function scriptedSseFetch(
  streams: readonly (readonly SseEvent[])[],
  recorded: RecordedRequest[],
  headers: Readonly<Record<string, string>> = {},
): typeof fetch {
  let call = 0;
  return (input, init): Promise<Response> => {
    const events = streams[Math.min(call, streams.length - 1)] ?? [];
    call += 1;
    const raw = typeof init?.body === "string" ? init.body : "{}";
    recorded.push({ url: String(input), body: JSON.parse(raw) as Record<string, unknown>, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return Promise.resolve(new Response(sseBody(events), { status: 200, headers: { "content-type": "text/event-stream", ...headers } }));
  };
}

/** The Anthropic Messages event script for a THINKING + TOOL-CALL turn (the A1 first leg). */
export function anthropicThinkingToolStream(args: { readonly thinking: string; readonly signature: string }): SseEvent[] {
  return [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_leg1",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: args.thinking } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: args.signature } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    { event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "get_weather" } } },
    {
      event: "content_block_delta",
      data: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"city":"Paris"}' } },
    },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 1 } },
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 20 } } },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
}

/** The Anthropic REDACTED-thinking script: a reasoning block with no text and an opaque payload (B4). */
export function anthropicRedactedStream(redactedData: string): SseEvent[] {
  return [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_red",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "redacted_thinking", data: redactedData } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    { event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "done" } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 1 } },
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } } },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
}

/** An OpenAI-compatible chat chunk script carrying OpenRouter `reasoning_details` then a tool call (H4). */
export function openRouterReasoningToolStream(args: { readonly text: string; readonly signature: string }): SseEvent[] {
  const detail = { type: "reasoning.text", text: args.text, format: "anthropic-claude-v1", index: 0, signature: args.signature };
  return [
    {
      event: "",
      data: {
        id: "gen-leg1",
        object: "chat.completion.chunk",
        created: 1,
        model: "m",
        choices: [{ index: 0, delta: { role: "assistant", content: null, reasoning_details: [detail] }, finish_reason: null }],
      },
    },
    {
      event: "",
      data: {
        id: "gen-leg1",
        object: "chat.completion.chunk",
        created: 1,
        model: "m",
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"Paris"}' } }] },
            finish_reason: null,
          },
        ],
      },
    },
    {
      event: "",
      data: {
        id: "gen-leg1",
        object: "chat.completion.chunk",
        created: 1,
        model: "m",
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.001 },
      },
    },
  ];
}

/** A plain text-only OpenAI-compatible chunk script (the second leg of a tool loop). */
export function openAiTextStream(text: string): SseEvent[] {
  return [
    {
      event: "",
      data: {
        id: "gen-leg2",
        object: "chat.completion.chunk",
        created: 1,
        model: "m",
        choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
      },
    },
    {
      event: "",
      data: {
        id: "gen-leg2",
        object: "chat.completion.chunk",
        created: 1,
        model: "m",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    },
  ];
}

/** The Anthropic plain-text script (the second leg of the direct-wire tool loop). */
export function anthropicTextStream(text: string): SseEvent[] {
  return [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_leg2",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } } },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
}

/** The Anthropic CLASSIFIER-BLOCK script (audit A5): a 200 whose `message_delta` carries `stop_reason: "refusal"`
 *  plus `stop_details` — what a Fable safety block looks like on the wire. */
export function anthropicRefusalStream(details: { readonly category: string; readonly explanation: string }): SseEvent[] {
  return [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_refused",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    },
    {
      event: "message_delta",
      data: { type: "message_delta", delta: { stop_reason: "refusal", stop_details: { type: "refusal", ...details } }, usage: { output_tokens: 0 } },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
}

/** A generation capability with the axes a hosted chat turn reads; overrides replace whole axes. */
export function generationCapability(overrides: Partial<GenerationCapability> = {}): Capability {
  const generation: GenerationCapability = {
    reasoning: { mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high"], displayModes: ["summarized"] },
    sampling: { temperature: { min: 0, max: 1 } },
    input: ["text"],
    tools: { parallel: true },
    output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] },
    context: { window: 200_000 },
    turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
    ...overrides,
  };
  return { kind: "generation", generation };
}

// ── the cross-backend conformance fixtures (tests/inference/conformance) ──────────────────────────────────
// These three are WIRE-NEUTRAL fake-transport utilities rather than more Anthropic/OpenAI event scripts: the
// conformance suite drives every wire through one arm, so the transport-shaped differences (does the fake
// honour the abort signal? does the call stream or `doGenerate`?) belong beside the SSE fixtures, not in a
// rival harness.

/**
 * Wrap a fake `fetch` so an ALREADY-ABORTED `init.signal` rejects with `signal.reason` — which is what
 * undici does per spec, and therefore the only way a cancellation pin can observe WHICH reason a backend
 * handed the transport. A fake that ignores the signal makes every cancellation arm pass vacuously (the
 * turn simply succeeds), and it is what lets the abort-flatten law (`backends/kit/abort-flatten.ts`) be
 * asserted from outside: with the fold in place the reason is always a plain `AbortError`; with
 * `AbortSignal.any` it is the caller's own — which the transport classifier then reads.
 */
export function abortAware(inner: typeof fetch): typeof fetch {
  return (input, init): Promise<Response> => {
    const signal = init?.signal;
    if (signal?.aborted === true) {
      return Promise.reject(signal.reason);
    }
    return Promise.resolve(inner(input, init));
  };
}

/** A `fetch` that answers each call with the next scripted JSON body as literal TEXT and records what was
 *  sent. TEXT, not an object, so a TRUNCATED body (`{"choices": `) is expressible — the non-streaming
 *  `doGenerate` path the `structured` task takes on both hosted wires. */
export function scriptedJsonFetch(bodies: readonly string[], recorded: RecordedRequest[], status = 200): typeof fetch {
  let call = 0;
  return (input, init): Promise<Response> => {
    const body = bodies[Math.min(call, bodies.length - 1)] ?? "{}";
    call += 1;
    const raw = typeof init?.body === "string" ? init.body : "{}";
    recorded.push({ url: String(input), body: JSON.parse(raw) as Record<string, unknown> });
    return Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }));
  };
}
