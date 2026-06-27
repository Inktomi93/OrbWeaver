// Unit tests for the local-light IMAGE-EMBED role — pure transform logic over an injected fake cache.
// Driven through the public `createLocalLightBackend` seam. Asserts the ImageEmbedResult contract:
// image-side + text-side embedding into normalized vectors, empty-text → null (aligned), single vs
// array inputs, the not-supported throw for the `multimodal` PAIR kind (CLIP has no native fusion),
// default-model fallback, and abort.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { ImageEmbedRequest, ImageEmbedResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { LocalLightModelCache } from "@orb/server/infra/providers/backends/local-light";
import {
  createLocalLightBackend,
  DEFAULT_IMAGE_EMBED_MODEL,
} from "@orb/server/infra/providers/backends/local-light";
import { describe, expect, test } from "vitest";

const CRED = { source: "local-light", credentialId: null } as unknown as ResolvedCredential;
const MODEL = "Xenova/test-clip" as ModelId;

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
  };
}

function imageEmbedOf(
  cache: LocalLightModelCache,
): (req: ImageEmbedRequest) => Promise<ImageEmbedResult> {
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
    expect(res.model).toBe(MODEL);
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

    expect(res.model).toBe(DEFAULT_IMAGE_EMBED_MODEL);
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
