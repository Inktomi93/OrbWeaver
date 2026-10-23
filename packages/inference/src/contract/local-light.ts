import type { LocalLightCpuPercent, LocalTextEncoding, RerankOnnx } from "@orb/contracts/inference";
import type { ImageInput } from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";
import type { LoadTransformersKernel } from "#src/contract/local-light-kernel.ts";
import type { LocalLightLoadProgress, LocalLightRerankServing } from "#src/contract/local-light-worker.ts";
import type { EmbedRequest } from "#src/contract/roles.ts";
import type { LocalLightModelSlot } from "#src/contract/runtime.ts";
import type { ProviderBackend } from "./backend.ts";
import type { InferenceDeps, InferenceLog } from "./runtime.ts";

export interface LocalLightBackendDeps {
  readonly scheduleTimeout?: InferenceDeps["scheduleTimeout"];
  readonly now: () => number;
  readonly log: InferenceDeps["log"];
  readonly superviseDetached: InferenceDeps["superviseDetached"];
  readonly config: NonNullable<InferenceDeps["localLight"]> | undefined;
}

export interface LocalLightBackend {
  readonly backend: ProviderBackend;
  readonly prefetch: LocalLightPrefetchHandle;
  /** THE ACTIVE local-light embedding space tag for a model id — the same string the embed results carry. */
  readonly embedSpace: (modelId: ModelId) => string;
  readonly loadFailed: LocalLightModelCache["loadFailed"];
  /** Stop the inference worker (bounded); a no-op for an injected cache or a worker never started. */
  readonly close: () => Promise<void>;
  readonly settle: () => Promise<void>;
}

/** The inference seam the task files depend on — raw un-normalized vectors; task files own L2 + MRL. */
export interface LocalLightModelCache {
  readonly embedTexts: (
    modelId: ModelId,
    texts: readonly string[],
    inputType?: EmbedRequest["inputType"],
    encoding?: LocalTextEncoding,
  ) => Promise<Float32Array[]>;
  /** Every pair is cut to `serving.maxInputTokens` real tokens; `serving.onnx` picks the head, file and dtype. */
  readonly scorePairs: (modelId: ModelId, query: string, documents: readonly string[], serving: LocalLightRerankServing) => Promise<number[]>;
  readonly embedImages: (modelId: ModelId, images: readonly ImageInput[]) => Promise<Float32Array[]>;
  readonly embedClipTexts: (modelId: ModelId, texts: readonly string[], encoding?: LocalTextEncoding) => Promise<Float32Array[]>;
  /** Warm a slot's memos WITHOUT running inference — the prefetch's whole surface. `onnx` as in `scorePairs`. */
  readonly preload: (slot: LocalLightModelSlot, modelId: ModelId, onnx?: RerankOnnx) => Promise<void>;
  /** Whether the latest load of any part of this model (weights, tokenizer, processor) failed and no later
   *  load of that part has succeeded — the availability verdict's input. */
  readonly loadFailed: (modelId: ModelId) => boolean;
}

export interface ModelCacheConfig {
  readonly kernelModule?: string | undefined;
  readonly cpuPercent?: LocalLightCpuPercent | undefined;
  readonly device?: string | undefined;
  readonly embedDtype?: string | undefined;
  readonly cacheDir?: string | undefined;
  readonly allowRemoteModels?: boolean | undefined;
  readonly onProgress?: ((progress: LocalLightLoadProgress) => void) | undefined;
  readonly log: InferenceLog;
  /** Owned fire-and-forget for a model disposal. */
  readonly detach: (name: string, fn: () => Promise<void>) => void;
}

/** The tokenizer surface the pair fit needs; the lib's tokenizer satisfies it. */
export interface PairTokenizer {
  readonly encode: (text: string, options?: { text_pair?: string | null; add_special_tokens?: boolean }) => number[];
  readonly decode: (ids: number[], options: { skip_special_tokens: boolean }) => string;
}

export interface LocalLightPrefetchRecord {
  readonly status: LocalLightPrefetchStatus;
  readonly detail: string;
  readonly updatedAt: number;
}

export interface LocalLightPrefetchTarget {
  readonly slot: LocalLightModelSlot;
  readonly modelId: ModelId;
  /** The reranker's capability `rerank.onnx`, so the warm-up loads the files the first request will. */
  readonly onnx?: RerankOnnx | undefined;
}

export interface LocalLightPrefetchHandle {
  /** Schedule the walk (detached — boot never awaits it). Returns the drain: stops BEFORE the next slot. */
  readonly start: (targets: readonly LocalLightPrefetchTarget[]) => () => void;
  /** Re-attempt ONE slot; a slot already in flight joins it. Resolves with the record's detail line. */
  readonly retry: (slot: LocalLightModelSlot) => Promise<string>;
  readonly status: () => Readonly<Record<LocalLightModelSlot, LocalLightPrefetchRecord | undefined>>;
  /** The download-progress sink the model cache is built with — routes a tick to the slot that registered the repo id. */
  readonly onProgress: (progress: LocalLightLoadProgress) => void;
}

export interface LocalLightPrefetchDeps {
  readonly cache: () => Pick<LocalLightModelCache, "preload">;
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly detach: (name: string, fn: () => Promise<void>) => void;
}

export interface StHead {
  /** The hidden size the head reads: the encoder's `hidden_size` must equal it. */
  readonly inputDim: number;
  readonly dense: DenseLayer;
  readonly normWeight: Float32Array;
  readonly normBias: Float32Array;
  readonly score: DenseLayer;
}

export interface WorkerModelCache extends LocalLightModelCache {
  /** Stop the worker and reject its pending calls, waiting a bounded time for it to exit. Every later call is
   *  refused as `aborted`: close runs at shutdown, and a worker started after it would be torn down mid-run. */
  readonly close: () => Promise<void>;
  /** Join actual worker exit, including workers lost to an error before their exit event arrives. */
  readonly settle: () => Promise<void>;
}

export type TransformersModule = Awaited<ReturnType<LoadTransformersKernel>>;

export type LocalLightPrefetchStatus = (typeof LOCAL_LIGHT_PREFETCH_STATUSES)[number];

export interface DenseLayer {
  readonly weight: Float32Array;
  readonly bias: Float32Array | undefined;
  readonly inDim: number;
  readonly outDim: number;
  readonly activation: (x: number) => number;
}

export const LOCAL_LIGHT_PREFETCH_STATUSES = ["queued", "downloading", "ready", "failed"] as const;
