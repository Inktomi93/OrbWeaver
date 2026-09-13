// Unit tests for the vLLM rerank surface — a thin shaper over an INJECTED engine client (no network).
// Asserts: caller ids preserved across reordering (NOT array indices), descending sort + topN slice,
// empty-doc filtering, the no-scorable short-circuit, the text vs multimodal request shapes, and the #173
// window guard (client-side clamp + no `truncate_prompt_tokens`). The surface is INDEPENDENT — it only
// calls `client.enginePost`.

import type { ModelId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { createVllmRerank } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const CRED = makeResolvedCredential("vllm");
const MODEL = "Qwen/Qwen3-VL-Reranker" as ModelId;
/** A small stand-in for the live engine window (`env.VLLM_RERANK_MAX_MODEL_LEN` = 8192) — small enough that a
 *  test document can exceed it without a megabyte fixture. */
const TEST_WINDOW_TOKENS = 512;

interface RerankBody {
  query: unknown;
  documents: unknown[];
}
interface PostCall {
  readonly body: RerankBody;
}

// A recording fake: scores each document `index` with a descending score, so request order ≠ score order.
function fakeClient(): { client: VllmEngineClient; calls: PostCall[] } {
  const calls: PostCall[] = [];
  const client: VllmEngineClient = {
    enginePost: <T>(_engine: unknown, _path: string, body: unknown): Promise<T> => {
      const b = body as RerankBody;
      calls.push({ body: b });
      // Score the LAST document highest, so the surface must re-sort and map indexes → ids.
      const results = b.documents.map((_, index) => ({
        index,
        // biome-ignore lint/style/useNamingConvention: vLLM wire response shape (snake_case).
        relevance_score: index, // ascending by index → reverse of request order after sort
      }));
      // @orb-waive no-test-fabrication(T): T is enginePost's caller-resolved generic, so no concrete factory can name it here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      // biome-ignore lint/style/useNamingConvention: vLLM wire response shape (snake_case).
      return Promise.resolve({ model: "served", results, usage: { total_tokens: 9 } } as T);
    },
    engineStream: () => Promise.reject(new Error("rerank must not stream")),
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

describe("createVllmRerank", () => {
  test("maps request-order indexes back to caller ids, sorted by score descending", async () => {
    const { client } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const res = await rerank({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [
        { id: "alpha", text: "a" },
        { id: "beta", text: "b" },
        { id: "gamma", text: "c" },
      ],
    });

    // The fake scores index 2 (gamma) highest → it leads; ids (not indexes) are returned.
    expect(res.hits.map((h) => h.id)).toEqual(["gamma", "beta", "alpha"]);
    expect(need(res.hits[0]).score).toBeGreaterThan(need(res.hits[1]).score);
    expect(res.usage.totalTokens).toBe(9);
    expect(res.model).toBe(MODEL);
  });

  test("respects topN (slice after the descending sort)", async () => {
    const { client } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const res = await rerank({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [
        { id: "a", text: "a" },
        { id: "b", text: "b" },
        { id: "c", text: "c" },
      ],
      topN: 2,
    });

    expect(res.hits).toHaveLength(2);
    expect(res.hits.map((h) => h.id)).toEqual(["c", "b"]);
  });

  test("filters empty-text documents before scoring (ids stay aligned to the survivors)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const res = await rerank({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [
        { id: "keep1", text: "x" },
        { id: "drop", text: "  " },
        { id: "keep2", text: "y" },
      ],
    });

    expect(need(calls[0]).body.documents).toHaveLength(2); // the empty doc never reached the engine
    expect(new Set(res.hits.map((h) => h.id))).toEqual(new Set(["keep1", "keep2"]));
  });

  test("a batch with no scorable documents returns empty hits without calling the engine", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const res = await rerank({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [{ id: "x", text: "   " }],
    });

    expect(calls).toHaveLength(0);
    expect(res.hits).toEqual([]);
    expect(res.usage.totalTokens).toBeNull();
  });

  test("text-only mode sends plain-string query + documents", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    await rerank({
      credential: CRED,
      model: MODEL,
      query: "hello",
      documents: [{ id: "a", text: "world" }],
    });

    expect(need(calls[0]).body.query).toBe("hello");
    expect(need(calls[0]).body.documents).toEqual(["world"]);
  });

  // #173, PROVEN LIVE against the box's rerank engine (Qwen3-VL-Reranker-2B, max_model_len 8192): an 8k-char
  // document scores in 327ms; a 60k-char document sent WITH `truncate_prompt_tokens: -1` hangs >25s (120s in
  // production, no request in the engine log, GPUs idle); the SAME document WITHOUT that field is refused in
  // 41ms. Same class as #165 on the embed surface — the knob that existed to avoid a 400 buys an unbounded
  // hang instead. So the guard moves CLIENT-side and the request asks the engine for nothing.
  test("never asks the engine to truncate — an over-window pair must fail FAST, never hang (#173)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    await rerank({ credential: CRED, model: MODEL, query: "q", documents: [{ id: "a", text: "short" }] });

    expect(need(calls[0]).body).not.toHaveProperty("truncate_prompt_tokens");
    expect(need(calls[0]).body).not.toHaveProperty("truncation_side");
  });

  test("clamps an over-window document to what the engine window leaves after the query (#173)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const huge = "the quick brown fox jumps over the lazy dog. ".repeat(400); // ≈4.4k tokens ≫ the window
    await rerank({ credential: CRED, model: MODEL, query: "find the fox", documents: [{ id: "big", text: huge }] });

    const sent = need(calls[0]).body.documents[0];
    expect(typeof sent).toBe("string");
    expect(estimateTokens(sent as string)).toBeLessThanOrEqual(TEST_WINDOW_TOKENS);
    // Clamped, not dropped — the head still rides, so the document is still scored.
    expect(sent as string).toContain("the quick brown fox");
  });

  test("a pathological QUERY is clamped too, and never crowds the documents out of the pair (#173)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const hugeQuery = "why did the caged bird sing that day. ".repeat(400);
    await rerank({ credential: CRED, model: MODEL, query: hugeQuery, documents: [{ id: "a", text: "a real document body" }] });

    const body = need(calls[0]).body;
    expect(estimateTokens(body.query as string)).toBeLessThanOrEqual(TEST_WINDOW_TOKENS / 2);
    // The document survives intact: the query took at most half the budget, so the pair still fits.
    expect(body.documents[0]).toBe("a real document body");
  });

  test("leaves an in-window pair byte-identical (the clamp is not a rewrite)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    await rerank({ credential: CRED, model: MODEL, query: "hello", documents: [{ id: "a", text: "world" }] });

    expect(need(calls[0]).body.query).toBe("hello");
    expect(need(calls[0]).body.documents).toEqual(["world"]);
  });

  test("an image on a document switches that side to a ScoreMultiModalParam (content parts)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    await rerank({
      credential: CRED,
      model: MODEL,
      query: "find it",
      documents: [{ id: "img", image: png }],
    });

    const doc = need(calls[0]).body.documents[0];
    // A multimodal doc is a ScoreMultiModalParam object (NOT a plain string), carrying the image as a
    // base64 data URI — the engine never needs network access.
    expect(typeof doc).toBe("object");
    expect(JSON.stringify(doc)).toContain("data:image/png;base64,");
  });

  test("the multimodal path clamps its TEXT part too (the image side keeps the fast 400 as its backstop, #173)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client, maxInputTokens: TEST_WINDOW_TOKENS });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const huge = "a very long caption about the picture. ".repeat(400);
    await rerank({ credential: CRED, model: MODEL, query: "find it", documents: [{ id: "img", text: huge, image: png }] });

    const doc = need(calls[0]).body.documents[0] as { content: { type: string; text?: string }[] };
    const textPart = doc.content.find((p) => p.type === "text");
    expect(estimateTokens(need(textPart?.text))).toBeLessThanOrEqual(TEST_WINDOW_TOKENS);
  });
});
