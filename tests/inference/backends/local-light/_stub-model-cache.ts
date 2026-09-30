// A stand-in for `model-cache.ts` that the local-light worker loads in the worker-cache tests. Its text
// commands mimic the real cache's hazards: a synchronous block the length of an ONNX run, a thrown
// ProviderError, and the worker thread dying mid-call.

import process from "node:process";
import type { ModelId } from "@orb/kit/ids";
import type { LocalLightModelCache } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";

export const BLOCK_PREFIX = "block:";
export const CRASH = "crash";
export const REFUSE = "refuse";
export const ABSENT_MODEL = "orb-test/absent-model";
export const CRASH_EXIT_CODE = 7;

/** Hold the calling thread for `ms` without yielding, the way `onnxruntime-node` holds it for a run. */
export function holdThread(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}

function embed(texts: readonly string[]): Promise<Float32Array[]> {
  const [first = ""] = texts;
  if (first.startsWith(BLOCK_PREFIX)) {
    holdThread(Number(first.slice(BLOCK_PREFIX.length)));
  }
  if (first === CRASH) {
    process.exit(CRASH_EXIT_CODE);
  }
  if (first === REFUSE) {
    return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: "stub refusal", model: "orb-test/stub", detail: "stub-detail" }));
  }
  return Promise.resolve(texts.map((text) => Float32Array.from([text.length, 1, 2])));
}

export function createModelCache(): LocalLightModelCache {
  const failed = new Set<ModelId>();
  return {
    embedTexts: (_modelId, texts): Promise<Float32Array[]> => embed(texts),
    embedClipTexts: (_modelId, texts): Promise<Float32Array[]> => embed(texts),
    embedImages: (_modelId, images): Promise<Float32Array[]> => Promise.resolve(images.map(() => Float32Array.from([0]))),
    scorePairs: (_modelId, _query, documents): Promise<number[]> => Promise.resolve(documents.map((_doc, i) => i)),
    removeBackground: (_modelId, image): Promise<Uint8Array> =>
      Promise.resolve(typeof image === "string" ? new Uint8Array() : Uint8Array.from(image).reverse()),
    preload: (_slot, modelId): Promise<void> => {
      if (modelId === ABSENT_MODEL) {
        failed.add(modelId);
        return Promise.reject(new Error("no weights for this model"));
      }
      failed.delete(modelId);
      return Promise.resolve();
    },
    loadFailed: (modelId): boolean => failed.has(modelId),
  };
}
