// Unit tests for the vLLM TEXT-embed surface — a thin shaper over an INJECTED engine client (no network).
// Asserts: empty→null filtering with order preserved, L2-normalization, MRL `dimensions` truncation, the
// dimensions-rejected client-side fallback, chunked bounded-concurrency dispatch, usage aggregation, and
// that the cookbook ChatML prompt + the requested dim reach the engine. The surface is INDEPENDENT — it
// only ever calls `client.enginePost` (never a sibling surface).

import type { ModelId } from "@orb/kit/ids";
import { estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import { cosineSim } from "@orb/kit/vector-math";
import { ProviderError } from "@orb/server/infra/providers";
import { createVllmEmbed } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const CRED = makeResolvedCredential("vllm");
const MODEL = "Qwen/Qwen3-VL-Embedding" as ModelId;
const TIMEOUT_ABORT_RE = /aborted/i;

interface PostCall {
  readonly path: string;
  readonly body: { input: string[]; dimensions?: number } & Record<string, unknown>;
}

// The engine window used by the clamp specs — small so a spec input can exceed it without a megabyte fixture.
const TEST_WINDOW_TOKENS = 200;
// A transport batch bound big enough that the count/window specs never trip it (the #187 specs set their own).
const TEST_MAX_BATCH_TOKENS = 1_000_000;

// A recording fake: returns a fixed 4-dim raw vector per input; optionally rejects the FIRST `dimensions`
// request (to exercise the MRL fallback) or answers 2-dim (a SHORT vector — the #1635 malformed response). `engineStream` is unused by embed (asserts surface isolation).
// `timeouts` records the per-POST bound the surface derived (#187).
function fakeClient(opts: { failDimOnce?: boolean; shortVector?: boolean } = {}): {
  client: VllmEngineClient;
  calls: PostCall[];
  timeouts: (number | undefined)[];
} {
  const calls: PostCall[] = [];
  const timeouts: (number | undefined)[] = [];
  let failed = false;
  const client: VllmEngineClient = {
    enginePost: <T>(_engine: unknown, path: string, body: unknown, postOpts?: { timeoutMs?: number | undefined }): Promise<T> => {
      const b = body as PostCall["body"];
      calls.push({ path, body: b });
      timeouts.push(postOpts?.timeoutMs);
      if (opts.failDimOnce === true && !failed && b.dimensions !== undefined) {
        failed = true;
        return Promise.reject(new Error("unknown field: dimensions"));
      }
      const data = b.input.map((_, i) => ({ index: i, embedding: opts.shortVector === true ? [1, 2] : [1, 2, 3, 4] }));
      // @orb-waive no-test-fabrication(T): T is enginePost's unbound generic, resolved only by the caller — no fixed shape to satisfy. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      return Promise.resolve({
        data,
        model: "served-model",
        // biome-ignore lint/style/useNamingConvention: vLLM wire response shape (snake_case).
        usage: { prompt_tokens: 5, total_tokens: 5 },
      } as T);
    },
    engineStream: () => Promise.reject(new Error("embed must not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };
  return { client, calls, timeouts };
}

function nonNull(vec: Float32Array | null): Float32Array {
  if (vec === null) {
    throw new Error("expected a non-null vector");
  }
  return vec;
}

// Narrow an indexed-access result (possibly-undefined under noUncheckedIndexedAccess) or fail the test.
function need<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected a defined value");
  }
  return value;
}

describe("createVllmEmbed", () => {
  test("filters empty/whitespace to null, preserves order, carries the request model", async () => {
    const { client } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    const res = await embed({ credential: CRED, model: MODEL, input: ["hi", "", "  ", "yo"] });

    expect(res.vectors).toHaveLength(4);
    expect(res.vectors[0]).toBeInstanceOf(Float32Array);
    expect(res.vectors[1]).toBeNull();
    expect(res.vectors[2]).toBeNull();
    expect(res.vectors[3]).toBeInstanceOf(Float32Array);
    expect(res.model).toBe(MODEL);
  });

  test("L2-normalizes each vector (cosine with itself ≈ 1)", async () => {
    const { client } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    const res = await embed({ credential: CRED, model: MODEL, input: "solo" });

    const vec = nonNull(res.vectors[0] ?? null);
    expect(vec).toHaveLength(4);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
  });

  test("honors MRL `dimensions`: truncates to the leading coords + re-normalizes, and sends the dim", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    const res = await embed({ credential: CRED, model: MODEL, input: "x", dimensions: 2 });

    const vec = nonNull(res.vectors[0] ?? null);
    expect(vec).toHaveLength(2);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
    expect(need(calls[0]).body.dimensions).toBe(2);
  });

  test("falls back to a full-dim request (then client-side truncation) when the engine rejects `dimensions`", async () => {
    const { client, calls } = fakeClient({ failDimOnce: true });
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    const res = await embed({ credential: CRED, model: MODEL, input: "x", dimensions: 2 });

    // First call carried `dimensions` (rejected); the retry dropped it; result still produced.
    expect(calls).toHaveLength(2);
    expect(need(calls[0]).body.dimensions).toBe(2);
    expect(need(calls[1]).body.dimensions).toBeUndefined();
    expect(nonNull(res.vectors[0] ?? null)).toHaveLength(2);
  });

  test("chunks the batch and aggregates usage across chunks", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 2,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    const res = await embed({
      credential: CRED,
      model: MODEL,
      input: ["a", "b", "c", "d", "e"],
    });

    expect(res.vectors).toHaveLength(5);
    expect(res.vectors.every((v) => v instanceof Float32Array)).toBe(true);
    expect(calls).toHaveLength(3); // ceil(5/2)
    // 5 tokens per chunk × 3 chunks (the fake reports 5 each).
    expect(res.usage.promptTokens).toBe(15);
    expect(res.usage.totalTokens).toBe(15);
  });

  test("wraps each input in the cookbook ChatML prompt before sending", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    await embed({ credential: CRED, model: MODEL, input: "hello", inputType: "query" });

    const sent = need(need(calls[0]).body.input[0]);
    expect(sent).toContain("<|im_start|>system");
    expect(sent).toContain("hello");
    // The query instruction (asymmetric retrieval) — not the doc default.
    expect(sent).toContain("Retrieve images or text");
  });

  test("an all-empty batch returns all-null vectors without calling the engine", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    const res = await embed({ credential: CRED, model: MODEL, input: ["", "  "] });

    expect(calls).toHaveLength(0);
    expect(res.vectors).toEqual([null, null]);
    expect(res.usage).toEqual({ promptTokens: null, totalTokens: null });
  });

  // #165, PROVEN LIVE against the box's embed engine (Qwen3-VL-Embedding-2B, max_model_len 8192): an input
  // over the window sent WITH `truncate_prompt_tokens: -1` HANGS (>30s probe, 120s in production — the memory
  // backfill's ~2min-per-chat plan failure), while the SAME input sent WITHOUT that field is refused in 21ms
  // with an honest 400. The knob that existed to avoid the 400 bought an unbounded hang instead, so the
  // window guard moves CLIENT-side and the request no longer asks the engine to truncate.
  test("clamps an over-window input to the engine window before dispatch (#165)", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    const huge = "the quick brown fox jumps over the lazy dog. ".repeat(400); // ≈4.4k tokens
    await embed({ credential: CRED, model: MODEL, input: huge });

    const sent = need(need(calls[0]).body.input[0]);
    expect(estimateTokens(sent)).toBeLessThanOrEqual(TEST_WINDOW_TOKENS);
    // Clamped, not dropped: the head of the text still rides (and the ChatML scaffold survives the cut).
    expect(sent).toContain("<|im_start|>system");
    expect(sent).toContain("the quick brown fox");
  });

  test("leaves an in-window input byte-identical (the clamp is not a rewrite)", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    await embed({ credential: CRED, model: MODEL, input: "a short line" });

    expect(need(need(calls[0]).body.input[0])).toContain("a short line<|im_end|>");
  });

  test("never asks the engine to truncate — an over-window request must fail FAST, never hang (#165)", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    await embed({ credential: CRED, model: MODEL, input: "hello" });

    expect(need(calls[0]).body).not.toHaveProperty("truncate_prompt_tokens");
  });

  // A warming/wedged engine accepts the socket but never answers. Pre-fix the surface passed the caller's
  // (undefined) signal straight through, so this embed hung FOREVER — the "boot is hostage to the engine"
  // trap. The bound is now composed in ONE home (the engine client, off the `timeoutMs` this surface derives);
  // the fake reproduces that composition so the surface's own always-bounded property still pins here.
  test("aborts a hung engine request within the bounded timeout instead of hanging forever", async () => {
    // enginePost that never resolves on its own — it settles only when the bound the surface asked for fires.
    const hangingClient: VllmEngineClient = {
      enginePost: <T>(_e: unknown, _p: string, _b: unknown, postOpts?: { signal?: AbortSignal | undefined; timeoutMs?: number | undefined }): Promise<T> =>
        new Promise<T>((_resolve, reject) => {
          const abort = (): void => reject(new Error("engine request aborted (timeout)"));
          postOpts?.signal?.addEventListener("abort", abort, { once: true });
          if (postOpts?.timeoutMs !== undefined) {
            setTimeout(abort, postOpts.timeoutMs);
          }
        }),
      engineStream: () => Promise.reject(new Error("embed must not stream")),
      baseUrl: () => "http://127.0.0.1:0",
    };
    const embed = createVllmEmbed({
      client: hangingClient,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 4,
      requestTimeoutMs: 50,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    await expect(embed({ credential: CRED, model: MODEL, input: "hello" })).rejects.toThrow(TIMEOUT_ABORT_RE);
  });

  // #187 — THE TRANSPORT BATCH IS BOUNDED BY TOKENS, not by item count alone. `chunkSize` (128) says nothing
  // about the work a POST carries: the #172 segment flood's length-sorted tail packed 128 near-window blocks
  // into ONE POST (~1M prompt tokens, measured), and a POST that big blows any fixed deadline AND head-of-line
  // blocks every other caller on the engine (measured live: a 29-token POST took 59ms idle, 72,769ms behind two
  // flood POSTs — which is how the image-index embed failed with the same 120s error). Sub-batching is
  // TRANSPORT sizing, not throttling: the sub-POSTs still go out back-to-back at the same worker count.
  test("bounds each POST by TOKENS as well as item count (#187)", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 1,
      requestTimeoutMs: 120_000,
      maxInputTokens: 4000,
      maxBatchTokens: 900,
    });
    const text = "the quick brown fox jumps over the lazy dog. ".repeat(20); // ≈225 estimated tokens
    await embed({ credential: CRED, model: MODEL, input: new Array(12).fill(text) });

    expect(calls.length).toBeGreaterThan(1); // one 12-input POST would carry ~3k tokens
    for (const call of calls) {
      const tokens = call.body.input.reduce((sum, t) => sum + estimateTokens(t), 0);
      expect(tokens).toBeLessThanOrEqual(900);
    }
  });

  // #187 — the DEADLINE is derived from the batch, not a constant. A fixed bound is a landmine at corpus scale:
  // the same 120s that is generous for one input is short for a quarter-million-token POST.
  test("derives each POST's deadline from the tokens that POST carries (#187)", async () => {
    const { client, timeouts } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 1,
      requestTimeoutMs: 1000,
      maxInputTokens: 4000,
      maxBatchTokens: 100_000,
    });
    const text = "the quick brown fox jumps over the lazy dog. ".repeat(200); // ≈2.25k estimated tokens
    await embed({ credential: CRED, model: MODEL, input: [text] });
    const big = need(timeouts[0]);

    const { client: c2, timeouts: t2 } = fakeClient();
    const small = createVllmEmbed({
      client: c2,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 1,
      requestTimeoutMs: 1000,
      maxInputTokens: 4000,
      maxBatchTokens: 100_000,
    });
    await small({ credential: CRED, model: MODEL, input: ["hi"] });

    expect(need(t2[0])).toBe(1000); // a tiny POST rides the configured base bound
    expect(big).toBeGreaterThan(1000); // a 2.25k-token POST asks for more than the base
  });

  // #187 — the ESTIMATE undershoots a real BPE tokenizer. Measured live against the box's embed engine
  // (Qwen3-VL-Embedding-2B, max_model_len 8192) on the imported corpus: 6 of the 30 largest blocks, clamped to
  // the estimator's own `window - 64` budget, were refused 400 "at least 8193 input tokens"; the worst
  // estimate→engine ratio measured was 1.4156. So the budget carries proportional headroom, not a flat reserve.
  test("keeps the clamp budget under the window by the estimator's headroom factor (#187)", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 1,
      requestTimeoutMs: 120_000,
      maxInputTokens: 1000,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    await embed({ credential: CRED, model: MODEL, input: "word ".repeat(2000) });

    expect(estimateTokens(need(need(calls[0]).body.input[0]))).toBeLessThanOrEqual(safeTokenWindow(1000));
  });

  // #1635 — the asymmetry that made the ONE RULE necessary. OpenRouter refuses a width that contradicts
  // `dimensions`; this surface silently accepted anything at-or-under it, so a SHORT vector from a
  // misconfigured or partially-loaded engine landed in the store in a different space than the one the
  // caller asked for. Nothing downstream can detect that: a stored vector carries no evidence of the width
  // it was supposed to be, and it just becomes a permanently wrong neighbour set.
  test("refuses a SHORT vector from the engine rather than storing a wrong-width vector (#1635)", async () => {
    const { client } = fakeClient({ shortVector: true });
    const embed = createVllmEmbed({
      client,
      embedDim: 4,
      chunkSize: 128,
      concurrency: 1,
      requestTimeoutMs: 120_000,
      maxInputTokens: TEST_WINDOW_TOKENS,
      maxBatchTokens: TEST_MAX_BATCH_TOKENS,
    });
    // Asking for 4 while the engine answers 2 — the exact shape MRL truncation cannot legitimately produce.
    const err = await embed({ credential: CRED, model: MODEL, input: "x", dimensions: 4 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind: "invalid", retryable: false });
    expect((err as ProviderError).message).toMatch(/expected 4.*got 2/su);
  });
});
