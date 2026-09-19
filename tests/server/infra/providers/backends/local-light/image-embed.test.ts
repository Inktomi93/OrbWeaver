// Unit tests for the local-light IMAGE-EMBED role — pure transform logic over an injected fake cache.
// Driven through the public `createLocalLightBackend` seam. Asserts the ImageEmbedResult contract:
// image-side + text-side embedding into normalized vectors, the unified 1024-dim jina-clip space (a fake
// jina cache → image AND text both 1024 from the SAME model — text↔image comparable), empty-text → null
// (aligned), single vs array inputs, the not-supported throw for the `multimodal` PAIR kind (jina-clip
// has no native fusion), default-model fallback, and abort. NOTE: the REAL jina-clip-v2 ONNX load (1024
// image + text features in ONE space) is verified by the opt-in, network-gated `image-embed.int.test.ts`
// (ORB_LOCAL_LIGHT_E2E=1) — CI exercises only this fake-cache seam.

import type { ModelId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { ImageEmbedRequest, ImageEmbedResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { LocalLightModelCache } from "@orb/server/infra/providers/backends/local-light";
import { createLocalLightBackend, DEFAULT_IMAGE_EMBED_MODEL } from "@orb/server/infra/providers/backends/local-light";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const CRED = makeResolvedCredential("local-light");
const MODEL = "Xenova/test-clip" as ModelId;
// The dtype half of the space tag (owner ruling 2026-09-19, #2417 — `LOCAL_LIGHT_EMBED_DTYPE` defaults to
// q8). A LITERAL, not an import: the default is the ruling, so a flip must red this rather than follow it.
// It must match `embed.test.ts`'s — one model, one joint space, therefore one tag for both modalities.
const DEFAULT_EMBED_DTYPE = "q8";
// The unified joint space — image + text vectors must both be this length to fit the F32_BLOB(1024) column.
const VECTOR_DIM = 1024;

/** A fake CLIP cache: image + text embedders each return a fixed 3-dim RAW vector per input and record
 *  how many inputs they were handed. */
function fakeCache(record: { imageCount?: number; textCount?: number }): LocalLightModelCache {
  return {
    embedTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
    scorePairs: (): Promise<number[]> => Promise.resolve([]),
    embedImages: (_modelId, images): Promise<Float32Array[]> => {
      record.imageCount = images.length;
      return Promise.resolve(images.map(() => Float32Array.from([3, 4, 0])));
    },
    embedClipTexts: (_modelId, texts): Promise<Float32Array[]> => {
      record.textCount = texts.length;
      return Promise.resolve(texts.map(() => Float32Array.from([0, 6, 8])));
    },
    removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
    preload: (): Promise<void> => Promise.resolve(),
  };
}

function imageEmbedOf(cache: LocalLightModelCache): (req: ImageEmbedRequest) => Promise<ImageEmbedResult> {
  const fn = createLocalLightBackend({ cache }).imageEmbed;
  if (fn === undefined) {
    throw new Error("local-light backend did not wire the imageEmbed role");
  }
  return fn;
}

function requireVector(vec: Float32Array | null): Float32Array {
  if (vec === null) {
    throw new Error("expected a non-null vector");
  }
  return vec;
}

describe("createLocalLightImageEmbed", () => {
  test("embeds image bytes and a path into normalized vectors (image kind, array)", async () => {
    const record: { imageCount?: number } = {};
    const res = await imageEmbedOf(fakeCache(record))({
      credential: CRED,
      model: MODEL,
      input: { kind: "image", input: [new Uint8Array([1, 2, 3]), "/tmp/pic.png"] },
    });

    expect(record.imageCount).toBe(2);
    expect(res.vectors).toHaveLength(2);
    const vec = requireVector(res.vectors[0] ?? null);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
    expect(res.model).toBe(`${MODEL}@${DEFAULT_EMBED_DTYPE}`);
  });

  test("a fake jina-clip cache yields 1024-dim image AND text vectors from the SAME joint space", async () => {
    // The fake mirrors the real jina-clip heads: image + text both emit a RAW 1024-dim vector — the ONE
    // model, two encoders, one space (text↔image comparable, fits the F32_BLOB(1024) column).
    const cache: LocalLightModelCache = {
      embedTexts: (): Promise<Float32Array[]> => Promise.resolve([]),
      scorePairs: (): Promise<number[]> => Promise.resolve([]),
      embedImages: (_modelId, images): Promise<Float32Array[]> =>
        Promise.resolve(images.map(() => Float32Array.from({ length: VECTOR_DIM }, (_v, i) => i + 1))),
      embedClipTexts: (_modelId, texts): Promise<Float32Array[]> =>
        Promise.resolve(texts.map(() => Float32Array.from({ length: VECTOR_DIM }, (_v, i) => VECTOR_DIM - i))),
      removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
      preload: (): Promise<void> => Promise.resolve(),
    };
    const embed = imageEmbedOf(cache);

    const imageRes = await embed({
      credential: CRED,
      model: DEFAULT_IMAGE_EMBED_MODEL as ModelId,
      input: { kind: "image", input: new Uint8Array([1, 2, 3]) },
    });
    const textRes = await embed({
      credential: CRED,
      model: DEFAULT_IMAGE_EMBED_MODEL as ModelId,
      input: { kind: "text", input: "a red square" },
    });

    const imageVec = requireVector(imageRes.vectors[0] ?? null);
    const textVec = requireVector(textRes.vectors[0] ?? null);
    expect(imageVec).toHaveLength(VECTOR_DIM);
    expect(textVec).toHaveLength(VECTOR_DIM);
    expect(cosineSim(imageVec, imageVec)).toBeCloseTo(1, 5);
    expect(cosineSim(textVec, textVec)).toBeCloseTo(1, 5);
    expect(imageRes.model).toBe(`${DEFAULT_IMAGE_EMBED_MODEL}@${DEFAULT_EMBED_DTYPE}`);
    expect(textRes.model).toBe(`${DEFAULT_IMAGE_EMBED_MODEL}@${DEFAULT_EMBED_DTYPE}`);
  });

  test("wraps a single image (Uint8Array) rather than iterating its bytes", async () => {
    const record: { imageCount?: number } = {};
    const res = await imageEmbedOf(fakeCache(record))({
      credential: CRED,
      model: MODEL,
      input: { kind: "image", input: new Uint8Array([9, 9, 9, 9]) },
    });

    expect(record.imageCount).toBe(1);
    expect(res.vectors).toHaveLength(1);
  });

  test("embeds texts into the joint space and filters empties to null (text kind)", async () => {
    const record: { textCount?: number } = {};
    const res = await imageEmbedOf(fakeCache(record))({
      credential: CRED,
      model: MODEL,
      input: { kind: "text", input: ["a cat", "  ", "a dog"] },
    });

    expect(record.textCount).toBe(2);
    expect(res.vectors).toHaveLength(3);
    expect(res.vectors[1]).toBeNull();
    const vec = requireVector(res.vectors[0] ?? null);
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
  });

  test("rejects the multimodal PAIR kind (CLIP has no native joint fusion)", async () => {
    await expect(
      imageEmbedOf(fakeCache({}))({
        credential: CRED,
        model: MODEL,
        input: { kind: "multimodal", input: { image: new Uint8Array([1]), text: "caption" } },
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("falls back to the default CLIP model when no model was resolved", async () => {
    const res = await imageEmbedOf(fakeCache({}))({
      credential: CRED,
      model: "" as ModelId,
      input: { kind: "text", input: "hello" },
    });

    expect(res.model).toBe(`${DEFAULT_IMAGE_EMBED_MODEL}@${DEFAULT_EMBED_DTYPE}`);
  });

  // #1474: the image side returned `raw.map(...)` with no count assertion, so a library anomaly that
  // dropped or added a vector MISALIGNED every vector against its image — silently, all the way into
  // the store. The count is the only thing that makes the positional alignment a fact rather than a hope.
  test("refuses when the model cache returns a vector count that does not match the image count", async () => {
    const shortCache: LocalLightModelCache = {
      ...fakeCache({}),
      // Two images in, ONE vector out — the misalignment this assertion exists to catch.
      embedImages: (): Promise<Float32Array[]> => Promise.resolve([Float32Array.from([3, 4, 0])]),
    };
    const err = await imageEmbedOf(shortCache)({
      credential: CRED,
      model: MODEL,
      input: { kind: "image", input: [new Uint8Array([1]), new Uint8Array([2])] },
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind: "invalid", retryable: false });
    expect((err as ProviderError).message).toMatch(/expected 2.*got 1/su);
  });

  test("throws a typed aborted error when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      imageEmbedOf(fakeCache({}))({
        credential: CRED,
        model: MODEL,
        input: { kind: "text", input: "x" },
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
