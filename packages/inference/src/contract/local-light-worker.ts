// The message protocol between the local-light host (`backends/local-light/worker-cache.ts`) and its worker
// thread (`backends/local-light/model-worker.ts`). Every value here crosses `postMessage`, so it stays structured-cloneable.

import type { ImageInput } from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";
import type { ProviderErrorInit } from "./errors.ts";
import type { InferenceLog, LocalLightModelSlot } from "./runtime.ts";

/** One download-progress tick for a model's weights. */
export interface LocalLightLoadProgress {
  readonly modelId: ModelId;
  readonly loaded: number;
  readonly total: number;
}

export type LocalLightLogLevel = keyof InferenceLog;

/** One model-cache call, named by the cache member it runs. */
export type LocalLightWorkerCall =
  | { readonly op: "embedTexts" | "embedClipTexts"; readonly modelId: ModelId; readonly texts: readonly string[] }
  | { readonly op: "scorePairs"; readonly modelId: ModelId; readonly query: string; readonly documents: readonly string[] }
  | { readonly op: "embedImages"; readonly modelId: ModelId; readonly images: readonly ImageInput[] }
  | { readonly op: "removeBackground"; readonly modelId: ModelId; readonly image: ImageInput }
  | { readonly op: "preload"; readonly modelId: ModelId; readonly slot: LocalLightModelSlot };

/** A thrown value as it crosses the thread boundary: a `ProviderError` keeps every field. */
export type LocalLightWorkerFailure = { readonly kind: "provider"; readonly init: ProviderErrorInit } | { readonly kind: "error"; readonly message: string };

export type LocalLightWorkerValue = Float32Array[] | number[] | Uint8Array | null;

export type LocalLightHostMessage = { readonly type: "call"; readonly id: number; readonly call: LocalLightWorkerCall } | { readonly type: "close" };

export type LocalLightWorkerMessage =
  | { readonly type: "reply"; readonly id: number; readonly loadFailed: boolean; readonly value: LocalLightWorkerValue }
  | { readonly type: "failure"; readonly id: number; readonly loadFailed: boolean; readonly failure: LocalLightWorkerFailure }
  | { readonly type: "progress"; readonly progress: LocalLightLoadProgress }
  | { readonly type: "log"; readonly level: LocalLightLogLevel; readonly fields: Record<string, unknown>; readonly message: string };

/** What the worker is started with: the model-cache config minus the host-side callbacks. */
export interface LocalLightWorkerOptions {
  readonly device?: string | undefined;
  readonly embedDtype?: string | undefined;
  readonly cacheDir?: string | undefined;
  readonly allowRemoteModels?: boolean | undefined;
  /** The module whose `createModelCache` builds the in-worker cache; tests point it at a stub. */
  readonly cacheModule: string;
}
