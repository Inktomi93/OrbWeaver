// Unit tests for the local-light RERANK role — pure transform logic over an injected fake cache.
// Driven through the public `createLocalLightBackend` seam. Asserts the RerankResult contract:
// caller-id keying (not array index), descending-score sort, `topN` truncation, empty-text-doc
// filtering, the text-only query-required throw, instruction prefixing of the query, default-model
// fallback, and abort.

import type { ModelId } from "@orb/kit/ids";
import type { RerankRequest, RerankResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { LocalLightModelCache } from "@orb/server/infra/providers/backends/local-light";
import { createLocalLightBackend, DEFAULT_RERANK_MODEL } from "@orb/server/infra/providers/backends/local-light";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const CRED = makeResolvedCredential("local-light");
const MODEL = "Xenova/test-rerank" as ModelId;

/** A fake cache whose scorer returns the document index as the score (so order is deterministic) and
 *  records the query it was handed. */
function fakeCache(record: { query?: string; docs?: readonly string[] }): LocalLightModelCache {
  return {
    embedTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
    scorePairs: (_modelId, query, documents): Promise<number[]> => {
      record.query = query;
      record.docs = [...documents];
      return Promise.resolve(documents.map((_doc, i) => i));
    },
    embedImages: (): Promise<Float32Array[]> => Promise.resolve([]),
    embedClipTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
    removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
  };
}

function rerankOf(cache: LocalLightModelCache): (req: RerankRequest) => Promise<RerankResult> {
  const fn = createLocalLightBackend({ cache }).rerank;
  if (fn === undefined) {
    throw new Error("local-light backend did not wire the rerank role");
  }
  return fn;
}

describe("createLocalLightRerank", () => {
  test("returns hits keyed by caller id, sorted by descending score", async () => {
    const res = await rerankOf(fakeCache({}))({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [
        { id: "doc-a", text: "alpha" },
        { id: "doc-b", text: "bravo" },
        { id: "doc-c", text: "charlie" },
      ],
    });

    // Fake scores by index (a=0, b=1, c=2) → descending order is c, b, a.
    expect(res.hits.map((h) => h.id)).toEqual(["doc-c", "doc-b", "doc-a"]);
    expect(res.hits[0]?.score).toBe(2);
    expect(res.model).toBe(MODEL);
    expect(res.usage).toEqual({ totalTokens: null });
  });

  test("honors topN by truncating after the descending sort", async () => {
    const res = await rerankOf(fakeCache({}))({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [
        { id: "a", text: "alpha" },
        { id: "b", text: "bravo" },
        { id: "c", text: "charlie" },
      ],
      topN: 2,
    });

    expect(res.hits.map((h) => h.id)).toEqual(["c", "b"]);
  });

  test("filters empty-text documents before scoring (their ids never appear)", async () => {
    const record: { docs?: readonly string[] } = {};
    const res = await rerankOf(fakeCache(record))({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [{ id: "keep", text: "real text" }, { id: "blank", text: "   " }, { id: "missing" }],
    });

    expect(res.hits.map((h) => h.id)).toEqual(["keep"]);
    expect(record.docs).toEqual(["real text"]);
  });

  test("returns no hits when every document was empty (model not invoked)", async () => {
    let called = false;
    const cache: LocalLightModelCache = {
      embedTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
      scorePairs: (): Promise<number[]> => {
        called = true;
        return Promise.resolve([]);
      },
      embedImages: (): Promise<Float32Array[]> => Promise.resolve([]),
      embedClipTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
      removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
    };
    const res = await rerankOf(cache)({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [{ id: "x", text: "" }],
    });

    expect(called).toBe(false);
    expect(res.hits).toEqual([]);
  });

  test("rejects a query with no text (the cross-encoder is text-only)", async () => {
    await expect(
      rerankOf(fakeCache({}))({
        credential: CRED,
        model: MODEL,
        query: { text: "   " },
        documents: [{ id: "a", text: "alpha" }],
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("prefixes the query with an instruction when supplied", async () => {
    const record: { query?: string } = {};
    await rerankOf(fakeCache(record))({
      credential: CRED,
      model: MODEL,
      query: "find cats",
      instruction: "Retrieve relevant passages:",
      documents: [{ id: "a", text: "alpha" }],
    });

    expect(record.query).toBe("Retrieve relevant passages: find cats");
  });

  test("falls back to the default reranker model when no model was resolved", async () => {
    const res = await rerankOf(fakeCache({}))({
      credential: CRED,
      model: "" as ModelId,
      query: "q",
      documents: [{ id: "a", text: "alpha" }],
    });

    expect(res.model).toBe(DEFAULT_RERANK_MODEL);
  });

  test("throws a typed aborted error when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      rerankOf(fakeCache({}))({
        credential: CRED,
        model: MODEL,
        query: "q",
        documents: [{ id: "a", text: "alpha" }],
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
