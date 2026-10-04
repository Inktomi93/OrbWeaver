// backends/local-light/model-cache — the REAL transformers.js loader, offline (`allowRemoteModels: false`) over a
// throwaway file cache: failed loads are recorded per model id for the availability verdict.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { modelIdSchema } from "@orb/contracts/inference";
import { afterAll } from "vitest";
import type { LocalLightModelCache } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { abortableWait, createModelCache, rerankBatches } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CACHE_DIR = mkdtempSync(join(tmpdir(), "orb-model-cache-"));
const ABSENT_MODEL = modelIdSchema.parse("orb-test/absent-model");
const OTHER_MODEL = modelIdSchema.parse("orb-test/other-model");
const noop = (): void => undefined;
const silentLog = { debug: noop, info: noop, warn: noop, error: noop };
// No test here loads enough models to evict one, so no disposal ever runs.
const detach = (_name: string, fn: () => Promise<void>): void => {
  fn().catch(noop);
};

afterAll(() => {
  rmSync(CACHE_DIR, { force: true, recursive: true });
});

function offlineCache(cacheDir = CACHE_DIR): LocalLightModelCache {
  return createModelCache({ cacheDir, allowRemoteModels: false, device: "cpu", log: silentLog, detach });
}

test("a failed load reads as failed for that model id only", async () => {
  const cache = offlineCache();
  expect(cache.loadFailed(ABSENT_MODEL)).toBe(false);
  await expect(cache.preload("rerank", ABSENT_MODEL)).rejects.toThrow();
  expect(cache.loadFailed(ABSENT_MODEL)).toBe(true);
  expect(cache.loadFailed(OTHER_MODEL)).toBe(false);
});

test("concurrent loads all wait for the cache dir, so none runs ahead with the library's default cache", async () => {
  const blocker = join(CACHE_DIR, "a-file");
  writeFileSync(blocker, "");
  // A path below a regular file is refused at once (ENOTDIR).
  const cache = offlineCache(join(blocker, "models"));
  const outcomes = await Promise.allSettled([cache.preload("rerank", ABSENT_MODEL), cache.preload("rerank", OTHER_MODEL)]);
  const reasons = outcomes.map((outcome) => (outcome.status === "rejected" ? String(outcome.reason) : "resolved"));
  expect(reasons).toEqual([expect.stringContaining("LOCAL_LIGHT_CACHE_DIR"), expect.stringContaining("LOCAL_LIGHT_CACHE_DIR")]);
});

// A caller can pass a signal that already fired. The wait must still hand back a promise that rejects as aborted,
// and it must still subscribe to the work, so a load that fails later is not an unhandled rejection.
test("an already-aborted signal: the wait rejects as aborted and the work's later failure stays handled", async () => {
  const load = Promise.withResolvers<number>();
  const controller = new AbortController();
  controller.abort();

  let waited: Promise<number> | undefined;
  expect(() => {
    waited = abortableWait(load.promise, controller.signal);
  }).not.toThrow();
  await expect(waited).rejects.toMatchObject({ kind: "aborted" });

  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    load.reject(new Error("the load failed after the caller stopped waiting"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

// A row's quantized files are per instruction set; serving another architecture's file, or quietly the fp32 one,
// would be a different model than the row measured.
test("a reranker whose row lists no ONNX file for this CPU architecture is refused by name, before any download", async () => {
  const otherArch = process.arch === "arm64" ? "x64" : "arm64";
  const failure = await offlineCache()
    .preload("rerank", OTHER_MODEL, { head: "sentence-transformers", dtype: "fp32", files: { [otherArch]: "model_quint8" } })
    .catch((err: unknown) => err);
  expect(failure).toMatchObject({ kind: "invalid", retryable: false });
  expect(String(failure)).toContain(`no ONNX file is listed for this CPU architecture (${process.arch})`);
});

// One padded batch of long pairs took 5.9 GB on CPU, so a batch never holds more token cells than one 2048-token
// pair, every pair is scored exactly once, and a pair over the budget still runs, alone.
test("rerank batches: bounded by padded token cells, shortest first, every pair once", () => {
  const lengths = [2048, 100, 600, 9000, 120, 500, 700];
  const batches = rerankBatches(lengths);
  expect(batches.flat().toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  for (const batch of batches) {
    const padded = Math.max(...batch.map((i) => lengths[i] ?? 0));
    expect(batch.length === 1 || batch.length * padded <= 2048, `batch ${JSON.stringify(batch)}`).toBe(true);
  }
  expect(batches).toEqual([[1, 4, 5], [2, 6], [0], [3]]);
  expect(rerankBatches([])).toEqual([]);
});

test("an already-aborted signal wins over work that has already finished", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(abortableWait(Promise.resolve(1), controller.signal)).rejects.toMatchObject({ kind: "aborted" });
});
