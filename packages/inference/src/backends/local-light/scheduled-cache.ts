// One native call runs at a time. Queries precede queued indexing batches; an active call finishes first.
import type { ModelId } from "@orb/kit/ids";
import { ProviderError } from "../../contract/errors.ts";
import type { LocalLightModelCache } from "./model-cache.ts";

const MAX_PENDING = 64;
const MAX_TEXT_BATCH = 4;
const MAX_PADDED_CHARACTERS = 8192;
const MAX_LENGTH_RATIO = 2;

interface TextItem {
  readonly text: string;
  readonly resolve: (vector: Float32Array) => void;
  readonly reject: (error: Error) => void;
}

interface TextGroup {
  readonly modelId: ModelId;
  readonly method: "embedTexts" | "embedClipTexts";
  readonly items: TextItem[];
}

function textBatches(items: readonly TextItem[]): TextItem[][] {
  const batches: TextItem[][] = [];
  for (const item of items.toSorted((a, b) => a.text.length - b.text.length)) {
    const batch = batches.at(-1);
    const first = batch?.[0];
    if (
      batch === undefined ||
      first === undefined ||
      batch.length >= MAX_TEXT_BATCH ||
      item.text.length > Math.max(1, first.text.length) * MAX_LENGTH_RATIO ||
      item.text.length * (batch.length + 1) > MAX_PADDED_CHARACTERS
    ) {
      batches.push([item]);
    } else {
      batch.push(item);
    }
  }
  return batches;
}

async function settleTextBatch(cache: LocalLightModelCache, group: TextGroup, batch: readonly TextItem[]): Promise<void> {
  // @orb-waive caught-failure-ownership(error): every batch caller owns a promise rejected below; no failure is lost. Ends if batch promises stop being the caller's result.
  try {
    const vectors = await cache[group.method](
      group.modelId,
      batch.map((item) => item.text),
    );
    if (vectors.length !== batch.length) {
      throw new ProviderError({ kind: "server", retryable: false, message: "local-light: the text batch returned the wrong vector count" });
    }
    for (const [index, item] of batch.entries()) {
      const vector = vectors[index];
      if (vector !== undefined) {
        item.resolve(vector);
      }
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    for (const item of batch) {
      item.reject(failure);
    }
  }
}

/** Preserve the cache API while bounding native work and combining concurrent text inputs. */
export function createScheduledCache(cache: LocalLightModelCache): LocalLightModelCache {
  const queries: (() => void)[] = [];
  const background: (() => void)[] = [];
  let running = false;
  let pending = 0;
  const groups = new Map<string, TextGroup>();

  function drain(): void {
    if (running) {
      return;
    }
    const next = queries.shift() ?? background.shift();
    if (next !== undefined) {
      running = true;
      next();
    }
  }

  function advance(): void {
    running = false;
    drain();
  }

  function enqueue<T>(run: () => Promise<T>, isQuery = false): Promise<T> {
    const result = Promise.withResolvers<T>();
    (isQuery ? queries : background).push(() => {
      void Promise.resolve()
        .then(run)
        .then(
          (value) => {
            result.resolve(value);
            advance();
          },
          (error: Error) => {
            result.reject(error);
            advance();
          },
        );
    });
    drain();
    return result.promise;
  }

  function admit<T>(run: () => Promise<T>): Promise<T> {
    if (pending >= MAX_PENDING) {
      return Promise.reject(new ProviderError({ kind: "server", retryable: true, message: "local-light: the inference queue is full" }));
    }
    pending += 1;
    return run().finally(() => {
      pending -= 1;
    });
  }

  function text(method: TextGroup["method"], modelId: ModelId, texts: readonly string[], isQuery = false): Promise<Float32Array[]> {
    return admit(() => {
      const key = `${method}:${modelId}:${isQuery}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { method, modelId, items: [] };
        groups.set(key, group);
        const captured = group;
        queueMicrotask(() => {
          groups.delete(key);
          for (const batch of textBatches(captured.items)) {
            // @orb-waive caught-failure-ownership(enqueue): each rejected batch rejects its waiting text callers below. Ends if text stops returning those promises.
            enqueue(() => settleTextBatch(cache, captured, batch), isQuery).catch((error: Error) => {
              for (const item of batch) {
                item.reject(error);
              }
            });
          }
        });
      }
      return Promise.all(
        texts.map((input) => {
          const result = Promise.withResolvers<Float32Array>();
          group.items.push({ text: input, resolve: result.resolve, reject: result.reject });
          return result.promise;
        }),
      );
    });
  }

  return {
    embedTexts: (modelId, texts, inputType) => text("embedTexts", modelId, texts, inputType === "query"),
    embedClipTexts: (modelId, texts) => text("embedClipTexts", modelId, texts),
    embedImages: (modelId, images) => admit(() => enqueue(() => cache.embedImages(modelId, images))),
    scorePairs: (modelId, query, documents) => admit(() => enqueue(() => cache.scorePairs(modelId, query, documents))),
    removeBackground: (modelId, image) => admit(() => enqueue(() => cache.removeBackground(modelId, image))),
    preload: (slot, modelId) => admit(() => enqueue(() => cache.preload(slot, modelId))),
    loadFailed: cache.loadFailed,
  };
}
