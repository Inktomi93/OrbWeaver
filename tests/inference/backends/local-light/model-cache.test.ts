// backends/local-light/model-cache — the REAL transformers.js loader, offline (`allowRemoteModels: false`) over a
// throwaway file cache: a failed load is recorded per model id for the availability verdict, and a config that
// names a model CLASS as its `model_type` gets past the background-removal pipeline's class resolution.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { modelIdSchema } from "@orb/contracts/inference";
import { afterAll } from "vitest";
import type { LocalLightModelCache } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { abortableWait, createModelCache } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CACHE_DIR = mkdtempSync(join(tmpdir(), "orb-model-cache-"));
const ABSENT_MODEL = modelIdSchema.parse("orb-test/absent-model");
const OTHER_MODEL = modelIdSchema.parse("orb-test/other-model");
const CLASS_NAMED_MODEL = modelIdSchema.parse("orb-test/class-named-segformer");
/** The class name a published config (briaai/RMBG-1.4) carries where a model-type key belongs. */
const SEGFORMER_CLASS = "SegformerForSemanticSegmentation";

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

test("a config naming a model class as its model_type reaches the weight load instead of a class refusal", async () => {
  const modelDir = join(CACHE_DIR, CLASS_NAMED_MODEL);
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(join(modelDir, "config.json"), JSON.stringify({ model_type: SEGFORMER_CLASS }));
  const cache = offlineCache();
  // No weights are seeded, so the load still fails: at the ONNX file, after the model class resolved.
  const failure = await cache.preload("matte", CLASS_NAMED_MODEL).then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain(`Unsupported model type "${SEGFORMER_CLASS}"`);
  expect(String(failure)).toContain("model.onnx");
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

test("an already-aborted signal wins over work that has already finished", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(abortableWait(Promise.resolve(1), controller.signal)).rejects.toMatchObject({ kind: "aborted" });
});
