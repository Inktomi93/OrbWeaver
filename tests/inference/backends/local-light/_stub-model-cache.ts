// A stand-in for `model-cache.ts` that the local-light worker loads in the worker-cache tests. Its text
// commands mimic the real cache's hazards: a synchronous block the length of an ONNX run, a thrown
// ProviderError, and the worker thread dying mid-call.

import process from "node:process";
import type { LocalTextEncoding } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import type { LocalLightModelCache, ModelCacheConfig } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import type { ProviderErrorInit } from "../../../../packages/inference/src/contract/errors.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { agentSdkSessionIdSchema } from "../../../../packages/inference/src/contract/identity.ts";

export const BLOCK_PREFIX = "block:";
export const CRASH = "crash";
export const REFUSE = "refuse";
export const REFUSE_EVERY_FIELD = "refuse-every-field";
export const ENCODING = "encoding";
export const CPU_BUDGET = "cpu-budget";
export const ABSENT_MODEL = "orb-test/absent-model";
export const CRASH_EXIT_CODE = 7;

/** Every `ProviderErrorInit` field but `cause` set, so a field added to the init fails to compile here until
 *  the thread-boundary copy is proven to carry it. */
export const EVERY_PROVIDER_ERROR_FIELD: Required<Omit<ProviderErrorInit, "cause">> = {
  kind: "rate_limit",
  retryable: true,
  message: "stub refusal with every field",
  resetsAt: 1_700_000_000_000,
  apiErrorStatus: 429,
  model: "orb-test/stub",
  terminalReason: "stub-terminal",
  detail: "stub-detail",
  violations: [{ kind: "optional-props", mode: "anthropic-format", count: 30, limit: 24 }],
  sessionId: agentSdkSessionIdSchema.parse("00000000-0000-4000-8000-000000000001"),
  requestId: "stub-request",
  width: { stated: 1024, measured: 768 },
  partialItems: [{ text: "stub item", usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }, undefined],
};

/** Hold the calling thread for `ms` without yielding, the way `onnxruntime-node` holds it for a run. */
export function holdThread(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}

function embed(texts: readonly string[], encoding?: LocalTextEncoding): Promise<Float32Array[]> {
  const [first = ""] = texts;
  if (first === ENCODING) {
    return Promise.resolve([Float32Array.of(encoding?.maxTokens ?? 0, encoding?.version ?? 0)]);
  }
  if (first.startsWith(BLOCK_PREFIX)) {
    holdThread(Number(first.slice(BLOCK_PREFIX.length)));
  }
  if (first === CRASH) {
    process.exit(CRASH_EXIT_CODE);
  }
  if (first === REFUSE) {
    return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: "stub refusal", model: "orb-test/stub", detail: "stub-detail" }));
  }
  if (first === REFUSE_EVERY_FIELD) {
    return Promise.reject(new ProviderError(EVERY_PROVIDER_ERROR_FIELD));
  }
  return Promise.resolve(texts.map((text) => Float32Array.from([text.length, 1, 2])));
}

export function createModelCache(config: ModelCacheConfig): LocalLightModelCache {
  const failed = new Set<ModelId>();
  return {
    embedTexts: (_modelId, texts, _inputType, encoding): Promise<Float32Array[]> =>
      texts[0] === CPU_BUDGET ? Promise.resolve([Float32Array.of(config.cpuPercent ?? 0)]) : embed(texts, encoding),
    embedClipTexts: (_modelId, texts, encoding): Promise<Float32Array[]> => embed(texts, encoding),
    embedImages: (_modelId, images): Promise<Float32Array[]> =>
      Promise.resolve(images.map((image) => Float32Array.from(typeof image === "string" ? [] : [image[0] ?? 0, image.at(-1) ?? 0]))),
    scorePairs: (_modelId, _query, documents): Promise<number[]> => Promise.resolve(documents.map((_doc, i) => i)),
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
