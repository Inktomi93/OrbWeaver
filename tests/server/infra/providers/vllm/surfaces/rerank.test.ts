// Unit tests for the vLLM rerank surface — a thin shaper over an INJECTED engine client (no network).
// Asserts: caller ids preserved across reordering (NOT array indices), descending sort + topN slice,
// empty-doc filtering, the no-scorable short-circuit, and the text vs multimodal request shapes. The
// surface is INDEPENDENT — it only calls `client.enginePost`.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { createVllmRerank } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const CRED = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;
const MODEL = "Qwen/Qwen3-VL-Reranker" as ModelId;

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
    const rerank = createVllmRerank({ client });
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
    const rerank = createVllmRerank({ client });
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
    const rerank = createVllmRerank({ client });
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
    const rerank = createVllmRerank({ client });
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
    const rerank = createVllmRerank({ client });
    await rerank({
      credential: CRED,
      model: MODEL,
      query: "hello",
      documents: [{ id: "a", text: "world" }],
    });

    expect(need(calls[0]).body.query).toBe("hello");
    expect(need(calls[0]).body.documents).toEqual(["world"]);
  });

  test("an image on a document switches that side to a ScoreMultiModalParam (content parts)", async () => {
    const { client, calls } = fakeClient();
    const rerank = createVllmRerank({ client });
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
});
