// Unit tests for the vLLM summarize surface — a request SHAPER over the gen chat-completion core (NOT a
// separate engine). Asserts: one item per input (index-aligned), the (system,user) shape reaches the gen
// chat endpoint, `<think>` CoT scaffolding is stripped, usage is carried (cost null for local), and a
// batch fans out, and the caller's AbortSignal reaches the engine POST (the cancellation seam that keeps a
// non-responsive box from hanging its caller — the `smart` arbitration's only way out of a hang).
// Independent — it shapes onto the engine core via the injected client, never a sibling.

import type { ModelId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { WireCaptureSink } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { createVllmStructured, createVllmSummarize } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe, vi } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const CRED = makeResolvedCredential("vllm");
const MODEL = "Qwen/Qwen3-VL-8B-Instruct" as ModelId;

// A monotonic fake clock (deterministic durations for the provider.summarize-item log).
function fakeNow(): () => number {
  let t = 1000;
  return () => {
    t += 5;
    return t;
  };
}

// The base summarize deps — a fake client + a deterministic clock; capture/log spies opt in per test.
function deps(client: VllmEngineClient, extra: { captureWire?: WireCaptureSink } = {}): Parameters<typeof createVllmSummarize>[0] {
  return { client, concurrency: 4, now: fakeNow(), ...extra };
}

interface ChatBody {
  messages: { role: string; content: unknown }[];
}
interface PostCall {
  readonly path: string;
  readonly body: ChatBody;
  readonly signal: AbortSignal | undefined;
}

// A recording fake: echoes the user prompt back as the "summary", wrapped with a <think> block to prove the
// surface strips it. `contentFor` overrides the returned message content (the S3 case returns a fixed JSON
// body carrying a literal <think> in a string value — proving the STRUCTURED role does NOT strip it).
function fakeClient(contentFor?: (user: string) => string): { client: VllmEngineClient; calls: PostCall[] } {
  const calls: PostCall[] = [];
  const client: VllmEngineClient = {
    enginePost: <T>(_engine: unknown, path: string, body: unknown, signal?: AbortSignal): Promise<T> => {
      const b = body as ChatBody;
      calls.push({ path, body: b, signal });
      const user = String(b.messages.find((m) => m.role === "user")?.content ?? "");
      const content = contentFor !== undefined ? contentFor(user) : `<think>reasoning</think>summary of ${user}`;
      return Promise.resolve({
        choices: [{ message: { content } }],
        // biome-ignore lint/style/useNamingConvention: vLLM wire response shape (snake_case).
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      } as T);
    },
    engineStream: () => Promise.reject(new Error("summarize must not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };
  return { client, calls };
}

// Narrow an indexed-access result (possibly-undefined under noUncheckedIndexedAccess) or fail the test.
function need<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected a defined value");
  }
  return value;
}

describe("createVllmSummarize", () => {
  test("returns one item per input, index-aligned, with <think> stripped", async () => {
    const { client } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 4 });
    const res = await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [
        { systemPrompt: "sys", userPrompt: "first" },
        { systemPrompt: "sys", userPrompt: "second" },
      ],
    });

    expect(res.items).toHaveLength(2);
    expect(need(res.items[0]).text).toBe("summary of first");
    expect(need(res.items[1]).text).toBe("summary of second");
    expect(need(res.items[0]).text).not.toContain("<think>");
    expect(res.model).toBe(MODEL);
  });

  test("shapes each task onto the gen chat-completion endpoint as (system, user)", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 4 });
    await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [{ systemPrompt: "be terse", userPrompt: "the text" }],
    });

    expect(need(calls[0]).path).toBe("/v1/chat/completions");
    const roles = need(calls[0]).body.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user"]);
    expect(need(need(calls[0]).body.messages[0]).content).toBe("be terse");
    expect(need(need(calls[0]).body.messages[1]).content).toBe("the text");
  });

  // The loop-guard reaches the wire: a summarize request's presencePenalty (+ the rest of the sampler set)
  // is emitted onto the gen chat-completion body. This is the seam the memory build's presence-penalty 1.5
  // default rides to stop Qwen3-VL from looping.
  test("the sampler set (presencePenalty et al.) reaches the gen chat-completion wire body", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 1 });
    await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [{ systemPrompt: "s", userPrompt: "u" }],
      presencePenalty: 1.5,
      topP: 0.9,
      repetitionPenalty: 1.05,
    });

    // FABRICATION-OK: reads the captured wire body
    const body = need(calls[0]).body as unknown as Record<string, unknown>;
    expect(body["presence_penalty"]).toBe(1.5);
    expect(body["top_p"]).toBe(0.9);
    expect(body["repetition_penalty"]).toBe(1.05);
  });

  test("carries token usage; cost is null for local inference", async () => {
    const { client } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 4 });
    const res = await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [{ systemPrompt: "s", userPrompt: "u" }],
    });

    expect(need(res.items[0]).usage).toEqual({ tokensIn: 11, tokensOut: 7, costUsd: null });
  });

  test("fans a batch out across the engine (one call per input)", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 2 });
    const res = await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [
        { systemPrompt: "s", userPrompt: "a" },
        { systemPrompt: "s", userPrompt: "b" },
        { systemPrompt: "s", userPrompt: "c" },
      ],
    });

    expect(calls).toHaveLength(3);
    expect(res.items.map((i) => i.text)).toEqual(["summary of a", "summary of b", "summary of c"]);
  });

  // THE HANG SEAM: a summarize caller that owns a cancellation (a chat turn's active-turn handle) can only
  // escape a box that accepted the socket and never answered if its signal reaches the fetch. Asserted at the
  // engine-POST boundary — the identity check proves the CALLER'S signal arrives, not a fresh one the surface
  // minted (which would abort nothing).
  test("threads the request's AbortSignal into every engine POST", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 2 });
    const controller = new AbortController();
    await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [
        { systemPrompt: "s", userPrompt: "a" },
        { systemPrompt: "s", userPrompt: "b" },
      ],
      signal: controller.signal,
    });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.signal).toBe(controller.signal);
    }
  });

  test("a request with no signal posts without one (no fabricated controller)", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 1 });
    await summarize({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "s", userPrompt: "a" }] });

    expect(need(calls[0]).signal).toBeUndefined();
  });
});

// OBSERVABILITY: each surface captures the wire body + emits a per-item turn log, TAGGED BY ROLE — the split
// (owner ruling 2026-07-27) means a structured extraction logs `provider.structured-item` under `api:"structured"`
// while real summarization stays `provider.summarize-item` under `api:"summarize"`. Debugging an rpg extraction
// never again greps "summarize".
describe("createVllmStructured — observability (the structured role: api/event tagged 'structured')", () => {
  const structFormat = { name: "rpg_state", schema: { type: "object" } };

  test("captures the LITERAL wire body per item under api:'structured' (gated by captureWire)", async () => {
    const { client } = fakeClient();
    const captured: { api: string; backend: string; model: string; body: Record<string, unknown> }[] = [];
    const structured = createVllmStructured({
      ...deps(client, { captureWire: (e) => captured.push({ api: e.api, backend: e.backend, model: e.model, body: e.body }) }),
      concurrency: 1,
    });
    await structured({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "sys", userPrompt: "beat text" }], responseFormat: structFormat });

    expect(captured).toHaveLength(1);
    expect(need(captured[0]).backend).toBe("vllm");
    expect(need(captured[0]).api).toBe("structured"); // NOT summarize — the split
    expect(need(captured[0]).body["response_format"]).toBeDefined();
  });

  test("emits provider.structured-item ok:true (role:'structured') with tokens + responseFormat", async () => {
    const spy = vi.spyOn(logger, "info");
    const { client } = fakeClient();
    const structured = createVllmStructured({ ...deps(client), concurrency: 1 });
    await structured({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "s", userPrompt: "u" }], responseFormat: structFormat });

    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.structured-item");
    expect(line).toBeDefined();
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["role"]).toBe("structured");
    expect(fields["backend"]).toBe("vllm");
    expect(fields["ok"]).toBe(true);
    expect(fields["tokensIn"]).toBe(11);
    expect(fields["hasResponseFormat"]).toBe(true);
  });

  // S3 — the structured role does NOT strip `<think>`: a literal `<think>…</think>` inside a JSON STRING VALUE
  // (e.g. journal content quoting the tag) is legitimate constrained output; stripping it would corrupt the JSON
  // / lose content. The prose (summarize) role still strips (pinned above at createVllmSummarize).
  test("S3: a literal <think> inside a structured JSON string value SURVIVES (no strip on the structured role)", async () => {
    const jsonWithThink = '{"journal":[{"type":"note","content":"He said <think>plan</think> aloud."}]}';
    const { client } = fakeClient(() => jsonWithThink); // the fake returns JSON carrying a literal <think>
    const structured = createVllmStructured({ ...deps(client), concurrency: 1 });
    const res = await structured({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "s", userPrompt: "u" }], responseFormat: structFormat });
    // The `<think>` tag is PRESERVED verbatim — the JSON is intact + parseable.
    expect(need(res.items[0]).text).toBe(jsonWithThink);
    expect(need(res.items[0]).text).toContain("<think>plan</think>");
    expect(() => JSON.parse(need(res.items[0]).text)).not.toThrow();
  });
});

describe("createVllmSummarize — observability (the summarize role: api/event tagged 'summarize')", () => {
  test("absent captureWire → no capture (zero cost, the compose default)", async () => {
    const { client } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 1 });
    const res = await summarize({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "s", userPrompt: "u" }] });
    expect(res.items).toHaveLength(1);
  });

  test("emits provider.summarize-item ok:true (role:'summarize') on a plain summarization", async () => {
    const spy = vi.spyOn(logger, "info");
    const { client } = fakeClient();
    const summarize = createVllmSummarize({ ...deps(client), concurrency: 1 });
    await summarize({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "s", userPrompt: "u" }] });

    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.summarize-item");
    expect(line).toBeDefined();
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["role"]).toBe("summarize");
    expect(fields["ok"]).toBe(true);
    expect(fields["hasResponseFormat"]).toBe(false); // summarization carries no schema
  });

  test("emits ok:false with the errorKind on failure — and still re-throws (batch rejects)", async () => {
    const spy = vi.spyOn(logger, "warn");
    const failing: VllmEngineClient = {
      enginePost: () => Promise.reject(new ProviderError({ kind: "server", retryable: true, message: "engine 500" })),
      engineStream: () => Promise.reject(new Error("no stream")),
      baseUrl: () => "http://127.0.0.1:0",
    };
    const summarize = createVllmSummarize({ ...deps(failing), concurrency: 1 });

    await expect(summarize({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "s", userPrompt: "u" }] })).rejects.toBeInstanceOf(ProviderError);

    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.summarize-item");
    expect(line).toBeDefined();
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["ok"]).toBe(false);
    expect(fields["errorKind"]).toBe("server");
  });
});
