// Unit tests for the local-light EMBED role — pure transform logic over an injected fake cache (no
// network, no ONNX). Driven through the public `createLocalLightBackend` seam. Asserts the EmbedResult
// contract: empty/whitespace → null (order preserved), single-string → one-element array, the unified
// 1024-dim jina-clip space (a fake jina cache → a 1024 unit-normalized vector tagged with the jina
// model), MRL `dimensions` truncation + re-normalization, the expand-beyond-native rejection,
// instruction prefixing, default-model fallback, abort, and the no-call short-circuit on an all-empty
// batch. NOTE: the REAL jina-clip-v2 ONNX load (1024 text features) is verified by the opt-in,
// network-gated `embed.int.test.ts` (ORB_LOCAL_LIGHT_E2E=1) — CI exercises only this fake-cache seam.

import type { ModelId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { EmbedRequest, EmbedResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { LocalLightModelCache } from "@orb/server/infra/providers/backends/local-light";
import { createLocalLightBackend, DEFAULT_EMBED_MODEL } from "@orb/server/infra/providers/backends/local-light";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

// Keyless local-light credential — a pure routing marker the backend never reads (the brand is
// unconstructable from a literal, so double-cast for the test).
const CRED = makeResolvedCredential("local-light");
const MODEL = "Xenova/test-embed" as ModelId;
// The unified embed space — every local-light vector must be this length to fit the F32_BLOB(1024) column.
const VECTOR_DIM = 1024;

/** A fake cache whose embedder returns a fixed 4-dim RAW vector per input and records the texts it saw. */
function fakeCache(record: { texts?: readonly string[] }): LocalLightModelCache {
  return {
    embedTexts: (_modelId, texts): Promise<Float32Array[]> => {
      record.texts = [...texts];
      return Promise.resolve(texts.map(() => Float32Array.from([1, 2, 3, 4])));
    },
    scorePairs: (): Promise<number[]> => Promise.resolve([]),
    embedImages: (): Promise<Float32Array[]> => Promise.resolve([]),
    embedClipTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
    removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
    preload: (): Promise<void> => Promise.resolve(),
  };
}

/** Resolve the wired embed callable (also asserts the backend wires the embed role). */
function embedOf(cache: LocalLightModelCache): (req: EmbedRequest) => Promise<EmbedResult> {
  const fn = createLocalLightBackend({ cache }).embed;
  if (fn === undefined) {
    throw new Error("local-light backend did not wire the embed role");
  }
  return fn;
}

/** Narrow a result slot to a vector or fail the test (avoids conditional-expect + non-null assertions). */
function requireVector(vec: Float32Array | null): Float32Array {
  if (vec === null) {
    throw new Error("expected a non-null vector");
  }
  return vec;
}

describe("createLocalLightEmbed", () => {
  test("filters empty/whitespace inputs to null and preserves request order", async () => {
    const res = await embedOf(fakeCache({}))({
      credential: CRED,
      model: MODEL,
      input: ["hello", "", "  ", "world"],
    });

    expect(res.vectors).toHaveLength(4);
    expect(res.vectors[0]).toBeInstanceOf(Float32Array);
    expect(res.vectors[1]).toBeNull();
    expect(res.vectors[2]).toBeNull();
    expect(res.vectors[3]).toBeInstanceOf(Float32Array);
    expect(res.model).toBe(MODEL);
    expect(res.usage).toEqual({ promptTokens: null, totalTokens: null });
  });

  test("a fake jina-clip cache yields a 1024-dim, unit-normalized vector tagged with the jina model", async () => {
    // The fake mirrors the real jina-clip text head: a RAW (un-normalized) 1024-dim vector per input.
    const cache: LocalLightModelCache = {
      embedTexts: (_modelId, texts): Promise<Float32Array[]> => Promise.resolve(texts.map(() => Float32Array.from({ length: VECTOR_DIM }, (_v, i) => i + 1))),
      scorePairs: (): Promise<number[]> => Promise.resolve([]),
      embedImages: (): Promise<Float32Array[]> => Promise.resolve([]),
      embedClipTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
      removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
      preload: (): Promise<void> => Promise.resolve(),
    };
    const res = await embedOf(cache)({
      credential: CRED,
      model: DEFAULT_EMBED_MODEL as ModelId,
      input: "into the unified space",
    });

    const vec = requireVector(res.vectors[0] ?? null);
    expect(vec).toHaveLength(VECTOR_DIM);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
    expect(res.model).toBe(DEFAULT_EMBED_MODEL);
  });

  test("a single string yields a one-element, L2-normalized vector array", async () => {
    const res = await embedOf(fakeCache({}))({ credential: CRED, model: MODEL, input: "solo" });

    expect(res.vectors).toHaveLength(1);
    const vec = requireVector(res.vectors[0] ?? null);
    expect(vec).toHaveLength(4);
    // cosineSim(v, v) === sum of squares === 1 for a unit vector.
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
  });

  test("honors MRL `dimensions`: truncates to the leading coords and re-normalizes", async () => {
    const res = await embedOf(fakeCache({}))({
      credential: CRED,
      model: MODEL,
      input: "x",
      dimensions: 2,
    });

    const vec = requireVector(res.vectors[0] ?? null);
    expect(vec).toHaveLength(2);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
    // Direction of the leading coords [1,2] preserved after re-normalization: the 2:1 ratio holds.
    expect((vec[1] ?? 0) / (vec[0] ?? 1)).toBeCloseTo(2, 5);
  });

  test("rejects `dimensions` larger than the model's native dimension", async () => {
    await expect(embedOf(fakeCache({}))({ credential: CRED, model: MODEL, input: "x", dimensions: 8 })).rejects.toBeInstanceOf(ProviderError);
  });

  test("applies an instruction prefix to every input", async () => {
    const record: { texts?: readonly string[] } = {};
    await embedOf(fakeCache(record))({
      credential: CRED,
      model: MODEL,
      input: ["a", "b"],
      instruction: "query:",
    });

    expect(record.texts).toEqual(["query: a", "query: b"]);
  });

  test("falls back to the default model id when the request carried no model", async () => {
    const res = await embedOf(fakeCache({}))({
      credential: CRED,
      model: "" as ModelId,
      input: "x",
    });

    expect(res.model).toBe(DEFAULT_EMBED_MODEL);
  });

  test("throws a typed aborted error when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      embedOf(fakeCache({}))({
        credential: CRED,
        model: MODEL,
        input: "x",
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("an all-empty input list returns all-null vectors without calling the model", async () => {
    let called = false;
    const cache: LocalLightModelCache = {
      embedTexts: (): Promise<Float32Array[]> => {
        called = true;
        return Promise.resolve([]);
      },
      scorePairs: (): Promise<number[]> => Promise.resolve([]),
      embedImages: (): Promise<Float32Array[]> => Promise.resolve([]),
      embedClipTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
      removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
      preload: (): Promise<void> => Promise.resolve(),
    };
    const res = await embedOf(cache)({ credential: CRED, model: MODEL, input: ["", " "] });

    expect(called).toBe(false);
    expect(res.vectors).toEqual([null, null]);
  });
});
