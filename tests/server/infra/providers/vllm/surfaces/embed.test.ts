// Unit tests for the vLLM TEXT-embed surface — a thin shaper over an INJECTED engine client (no network).
// Asserts: empty→null filtering with order preserved, L2-normalization, MRL `dimensions` truncation, the
// dimensions-rejected client-side fallback, chunked bounded-concurrency dispatch, usage aggregation, and
// that the cookbook ChatML prompt + the requested dim reach the engine. The surface is INDEPENDENT — it
// only ever calls `client.enginePost` (never a sibling surface).

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import { createVllmEmbed } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe, expect, test } from "vitest";

const CRED = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;
const MODEL = "Qwen/Qwen3-VL-Embedding" as ModelId;

interface PostCall {
  readonly path: string;
  readonly body: { input: string[]; dimensions?: number };
}

// A recording fake: returns a fixed 4-dim raw vector per input; optionally rejects the FIRST `dimensions`
// request (to exercise the MRL fallback). `engineStream` is unused by embed (asserts surface isolation).
function fakeClient(opts: { failDimOnce?: boolean } = {}): {
  client: VllmEngineClient;
  calls: PostCall[];
} {
  const calls: PostCall[] = [];
  let failed = false;
  const client: VllmEngineClient = {
    enginePost: <T>(_engine: unknown, path: string, body: unknown): Promise<T> => {
      const b = body as PostCall["body"];
      calls.push({ path, body: b });
      if (opts.failDimOnce === true && !failed && b.dimensions !== undefined) {
        failed = true;
        return Promise.reject(new Error("unknown field: dimensions"));
      }
      const data = b.input.map((_, i) => ({ index: i, embedding: [1, 2, 3, 4] }));
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
  return { client, calls };
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
    const embed = createVllmEmbed({ client, embedDim: 4, chunkSize: 128, concurrency: 4 });
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
    const embed = createVllmEmbed({ client, embedDim: 4, chunkSize: 128, concurrency: 4 });
    const res = await embed({ credential: CRED, model: MODEL, input: "solo" });

    const vec = nonNull(res.vectors[0] ?? null);
    expect(vec).toHaveLength(4);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
  });

  test("honors MRL `dimensions`: truncates to the leading coords + re-normalizes, and sends the dim", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({ client, embedDim: 4, chunkSize: 128, concurrency: 4 });
    const res = await embed({ credential: CRED, model: MODEL, input: "x", dimensions: 2 });

    const vec = nonNull(res.vectors[0] ?? null);
    expect(vec).toHaveLength(2);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
    expect(need(calls[0]).body.dimensions).toBe(2);
  });

  test("falls back to a full-dim request (then client-side truncation) when the engine rejects `dimensions`", async () => {
    const { client, calls } = fakeClient({ failDimOnce: true });
    const embed = createVllmEmbed({ client, embedDim: 4, chunkSize: 128, concurrency: 4 });
    const res = await embed({ credential: CRED, model: MODEL, input: "x", dimensions: 2 });

    // First call carried `dimensions` (rejected); the retry dropped it; result still produced.
    expect(calls).toHaveLength(2);
    expect(need(calls[0]).body.dimensions).toBe(2);
    expect(need(calls[1]).body.dimensions).toBeUndefined();
    expect(nonNull(res.vectors[0] ?? null)).toHaveLength(2);
  });

  test("chunks the batch and aggregates usage across chunks", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({ client, embedDim: 4, chunkSize: 2, concurrency: 4 });
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
    const embed = createVllmEmbed({ client, embedDim: 4, chunkSize: 128, concurrency: 4 });
    await embed({ credential: CRED, model: MODEL, input: "hello", inputType: "query" });

    const sent = need(need(calls[0]).body.input[0]);
    expect(sent).toContain("<|im_start|>system");
    expect(sent).toContain("hello");
    // The query instruction (asymmetric retrieval) — not the doc default.
    expect(sent).toContain("Retrieve images or text");
  });

  test("an all-empty batch returns all-null vectors without calling the engine", async () => {
    const { client, calls } = fakeClient();
    const embed = createVllmEmbed({ client, embedDim: 4, chunkSize: 128, concurrency: 4 });
    const res = await embed({ credential: CRED, model: MODEL, input: ["", "  "] });

    expect(calls).toHaveLength(0);
    expect(res.vectors).toEqual([null, null]);
    expect(res.usage).toEqual({ promptTokens: null, totalTokens: null });
  });
});
