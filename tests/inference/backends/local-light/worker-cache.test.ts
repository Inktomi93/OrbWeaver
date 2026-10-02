// backends/local-light/worker-cache — the model cache hosted on its own worker thread, driven over a stub cache
// module (`_stub-model-cache.ts`): the request loop keeps turning while the worker is held, results and typed
// failures cross the boundary intact, and a dead worker rejects its callers instead of hanging them.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";
import { LOCAL_LIGHT_SEED_ROWS, modelIdSchema } from "@orb/contracts/inference";
import type { WorkerModelCache } from "../../../../packages/inference/src/backends/local-light/worker-cache.ts";
import { createWorkerModelCache } from "../../../../packages/inference/src/backends/local-light/worker-cache.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { ABSENT_MODEL, BLOCK_PREFIX, CRASH, CRASH_EXIT_CODE, EVERY_PROVIDER_ERROR_FIELD, holdThread, REFUSE, REFUSE_EVERY_FIELD } from "./_stub-model-cache.ts";

const MODEL = modelIdSchema.parse("orb-test/stub");
const ABSENT = modelIdSchema.parse(ABSENT_MODEL);
const STUB_MODULE = new URL("./_stub-model-cache.ts", import.meta.url).href;
/** About one real card-text embed on a CPU box. */
const HOLD_MS = 1500;
const TICK_MS = 10;
/** The longest gap between two ticks the request loop may show while the worker is held. */
const MAX_TICK_GAP_MS = 250;
/** Ids transformers.js would resolve on this host's disk or as a URL instead of as a Hub repo. */
const PATH_SHAPED_MODEL_IDS = ["../../../etc", "/etc/orbweaver", "https://models.example/owner/repo", "C:\\models\\owner\\repo"];
/** Loading transformers.js and its ONNX binding in a fresh worker takes seconds on a CPU box. */
const REAL_LOADER_TIMEOUT_MS = 60_000;

const noop = (): void => undefined;

function stubCache(errors: string[] = []): WorkerModelCache {
  return createWorkerModelCache({
    cacheModule: STUB_MODULE,
    log: { debug: noop, info: noop, warn: noop, error: (_fields, message) => errors.push(message) },
  });
}

/** Run `work` while a timer ticks on this thread; resolve with the longest gap between ticks. */
async function longestTickGap(work: () => Promise<unknown>): Promise<number> {
  // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
  let last = performance.now();
  let longest = 0;
  const timer = setInterval(() => {
    // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, TICK_MS);
  try {
    await work();
    // One more tick lands after `work`, so a block right at its end is still measured.
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 2));
  } finally {
    clearInterval(timer);
  }
  return longest;
}

test("the tick gap detector sees a block on this thread", async () => {
  const gap = await longestTickGap(async () => {
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 2));
    holdThread(HOLD_MS);
  });
  expect(gap).toBeGreaterThan(HOLD_MS - TICK_MS);
});

test("a held worker leaves this thread's timers running", async () => {
  const cache = stubCache();
  try {
    await cache.embedTexts(MODEL, ["warm"]);
    const gap = await longestTickGap(() => cache.embedTexts(MODEL, [`${BLOCK_PREFIX}${String(HOLD_MS)}`]));
    expect(gap).toBeLessThan(MAX_TICK_GAP_MS);
  } finally {
    await cache.close();
  }
});

test("vectors, scores and bytes cross the thread boundary intact", async () => {
  const cache = stubCache();
  try {
    const vectors = await cache.embedTexts(MODEL, ["ab", "abcd"]);
    expect(vectors.map((row) => [...row])).toEqual([
      [2, 1, 2],
      [4, 1, 2],
    ]);
    expect(vectors[0]).toBeInstanceOf(Float32Array);
    await expect(cache.scorePairs(MODEL, "q", ["a", "b", "c"])).resolves.toEqual([0, 1, 2]);
    const images = await cache.embedImages(MODEL, [Uint8Array.from([1, 2, 3]), Uint8Array.from([5, 6])]);
    expect(images.map((row) => [...row])).toEqual([
      [1, 3],
      [5, 6],
    ]);
  } finally {
    await cache.close();
  }
});

test("a ProviderError thrown in the worker reaches the caller with its fields", async () => {
  const cache = stubCache();
  try {
    const failure = await cache.embedTexts(MODEL, [REFUSE]).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ kind: "invalid", retryable: false, message: "stub refusal", model: "orb-test/stub", detail: "stub-detail" });
  } finally {
    await cache.close();
  }
});

test("a failed load reads as failed for that model id on this thread", async () => {
  const cache = stubCache();
  try {
    await expect(cache.preload("embed", ABSENT)).rejects.toThrow("no weights for this model");
    expect(cache.loadFailed(ABSENT)).toBe(true);
    expect(cache.loadFailed(MODEL)).toBe(false);
  } finally {
    await cache.close();
  }
});

test("a worker that dies mid-call rejects the call as a retryable server error, and the next call starts a new worker", async () => {
  const errors: string[] = [];
  const cache = stubCache(errors);
  try {
    const failure = await cache.embedTexts(MODEL, [CRASH]).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ kind: "server", retryable: true });
    expect(String((failure as ProviderError).message)).toContain(`exit code ${String(CRASH_EXIT_CODE)}`);
    expect(errors).toEqual(["local-light: the inference worker stopped unexpectedly"]);
    const vectors = await cache.embedTexts(MODEL, ["abc"]);
    expect([...(vectors[0] ?? [])]).toEqual([3, 1, 2]);
  } finally {
    await cache.close();
  }
});

test("close waits out a native call in progress; the call answers, then the worker exits quietly", async () => {
  const errors: string[] = [];
  const cache = stubCache(errors);
  const inFlight = cache.embedTexts(MODEL, [`${BLOCK_PREFIX}${String(HOLD_MS)}`]);
  // Let the call reach the worker before the close does.
  await new Promise((resolve) => setTimeout(resolve, TICK_MS * 5));
  // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
  const started = performance.now();
  await cache.close();
  // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
  expect(performance.now() - started).toBeGreaterThan(HOLD_MS / 2);
  expect((await inFlight).length).toBe(1);
  expect(errors).toEqual([]);
});

test("a native call that outlasts the close wait: close returns at the bound with a warning", async () => {
  const warnings: string[] = [];
  const cache = createWorkerModelCache({
    cacheModule: STUB_MODULE,
    closeWaitMs: TICK_MS * 10,
    log: { debug: noop, info: noop, warn: (_fields, message) => warnings.push(message), error: noop },
  });
  const inFlight = cache.embedTexts(MODEL, [`${BLOCK_PREFIX}${String(HOLD_MS)}`]).catch((err: unknown) => err);
  await new Promise((resolve) => setTimeout(resolve, TICK_MS * 5));
  // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
  const started = performance.now();
  await cache.close();
  // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
  expect(performance.now() - started).toBeLessThan(HOLD_MS / 2);
  expect(warnings).toEqual(["local-light: the inference worker is still inside a model call; shutdown continues without it"]);
  expect(await inFlight).toMatchObject({ kind: "server", retryable: true });
});

test("close while idle returns at once, and a call after it is refused without starting a worker", async () => {
  const cache = stubCache();
  await cache.embedTexts(MODEL, ["warm"]);
  // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
  const started = performance.now();
  await cache.close();
  // @orb-waive test-determinism(performance.now): the SUBJECT is real elapsed time on this thread while another thread holds a model call; a frozen clock cannot see a blocked event loop.
  expect(performance.now() - started).toBeLessThan(MAX_TICK_GAP_MS);
  const failure = await cache.embedTexts(MODEL, ["abcd"]).catch((err: unknown) => err);
  expect(failure).toBeInstanceOf(ProviderError);
  expect(failure).toMatchObject({ kind: "aborted", retryable: false });
  await expect(cache.preload("embed", MODEL)).rejects.toMatchObject({ kind: "aborted", retryable: false });
});

test("a ProviderError carries every provenance field across the thread boundary", async () => {
  const cache = stubCache();
  try {
    const failure = await cache.embedTexts(MODEL, [REFUSE_EVERY_FIELD]).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject(EVERY_PROVIDER_ERROR_FIELD);
  } finally {
    await cache.close();
  }
});

test("an image given as a URL or path is refused as invalid and never reaches the worker", async () => {
  const cache = stubCache();
  try {
    await expect(cache.embedImages(MODEL, [Uint8Array.from([1]), "http://127.0.0.1/avatar.png"])).rejects.toMatchObject({ kind: "invalid", retryable: false });
    await expect(cache.embedImages(MODEL, [Uint8Array.from([1])])).resolves.toHaveLength(1);
  } finally {
    await cache.close();
  }
});

test("a model id that is not a Hub owner/repo is refused as invalid on every call and never reaches the loader", async () => {
  const cache = stubCache();
  try {
    for (const raw of PATH_SHAPED_MODEL_IDS) {
      const modelId = modelIdSchema.parse(raw);
      const calls = [
        cache.embedTexts(modelId, ["a"]),
        cache.embedClipTexts(modelId, ["a"]),
        cache.embedImages(modelId, [Uint8Array.from([1])]),
        cache.scorePairs(modelId, "q", ["a"]),
        cache.preload("embed", modelId),
      ];
      for (const outcome of await Promise.allSettled(calls)) {
        expect(outcome, raw).toMatchObject({ status: "rejected", reason: { kind: "invalid", retryable: false } });
      }
    }
    // The stub loader answers any id it is handed, so these resolving shows the refusals above stopped short of it.
    await expect(cache.embedTexts(modelIdSchema.parse("some-owner/any-model.v2"), ["ab"])).resolves.toHaveLength(1);
    for (const seed of LOCAL_LIGHT_SEED_ROWS) {
      await expect(cache.preload(seed.task === "rerank" ? "rerank" : "embed", modelIdSchema.parse(seed.model))).resolves.toBeUndefined();
    }
  } finally {
    await cache.close();
  }
});

test("a parent-directory id never makes the real loader read a model config outside its cache directory", { timeout: REAL_LOADER_TIMEOUT_MS }, async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-worker-model-id-"));
  const cacheDir = join(root, "cache");
  // A config the loader parses, then fails at the absent weights file: reaching "model.onnx" means it read this file.
  const planted = join(root, "outside", "model");
  mkdirSync(planted, { recursive: true });
  writeFileSync(join(planted, "config.json"), JSON.stringify({ model_type: "bert" }));
  const cache = createWorkerModelCache({ cacheDir, allowRemoteModels: false, device: "cpu", log: { debug: noop, info: noop, warn: noop, error: noop } });
  try {
    const failure = await cache.preload("rerank", modelIdSchema.parse("../outside/model")).then(
      () => null,
      (err: unknown) => err,
    );
    expect(String(failure)).not.toContain("model.onnx");
    expect(failure).toMatchObject({ kind: "invalid", retryable: false });
    // The worker creates its cache directory before its first load, so its absence shows no load ever began.
    expect(existsSync(cacheDir)).toBe(false);
  } finally {
    await cache.close();
    rmSync(root, { force: true, recursive: true });
  }
});

test("calls over the pending cap are refused as a retryable server error while the worker is held", async () => {
  const cache = createWorkerModelCache({ cacheModule: STUB_MODULE, maxPending: 2, log: { debug: noop, info: noop, warn: noop, error: noop } });
  try {
    await cache.embedTexts(MODEL, ["warm"]);
    const held = cache.embedTexts(MODEL, [`${BLOCK_PREFIX}${String(HOLD_MS / 3)}`]);
    const queued = cache.embedTexts(MODEL, ["queued"]);
    const over = await cache.embedTexts(MODEL, ["over"]).catch((err: unknown) => err);
    expect(over).toBeInstanceOf(ProviderError);
    expect(over).toMatchObject({ kind: "server", retryable: true });
    expect((await held).length).toBe(1);
    expect((await queued).length).toBe(1);
    await expect(cache.embedTexts(MODEL, ["after"])).resolves.toHaveLength(1);
  } finally {
    await cache.close();
  }
});

test("the worker's garbage collector reaches no other context or thread", async () => {
  const cache = stubCache();
  try {
    await cache.embedTexts(MODEL, ["warm"]);
    expect(runInNewContext("typeof gc")).toBe("undefined");
    const probe = new Worker('require("node:worker_threads").parentPort.postMessage(typeof globalThis.gc)', { eval: true });
    const seen = await new Promise((resolve) => probe.once("message", resolve));
    await probe.terminate();
    expect(seen).toBe("undefined");
  } finally {
    await cache.close();
  }
});
