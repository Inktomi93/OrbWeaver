// Unit tests for the local-light model-cache's exported pure helpers — `resolveModelId` (default-model
// fallback), `throwIfAborted` (typed abort belt), and `normalizeVector` (owned, unit-length output).
// The transformers.js/ONNX load + inference paths are exercised by the gated `*.int.test.ts` files.

import process from "node:process";
import { cosineSim } from "@orb/kit/vector-math";
import { ProviderError } from "@orb/server/infra/providers";
import { describe, vi } from "vitest";
// The cache's pure helpers are slice-internal (not on the family barrel), so import them via the
// mirror-relative source path rather than the `@orb/server/*` (index-only) export map.
import {
  createMemo,
  normalizeVector,
  resolveModelId,
  throwIfAborted,
} from "../../../../../../packages/server/src/infra/providers/backends/local-light/model-cache.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("resolveModelId", () => {
  test("returns the requested id when it is non-empty", () => {
    expect(resolveModelId("Xenova/bge-small", "fallback")).toBe("Xenova/bge-small");
  });

  test("falls back when the requested id is empty or whitespace", () => {
    expect(resolveModelId("", "fallback")).toBe("fallback");
    expect(resolveModelId("   ", "fallback")).toBe("fallback");
  });
});

describe("throwIfAborted", () => {
  test("is a no-op for an undefined or un-aborted signal", () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
    expect(() => throwIfAborted(new AbortController().signal)).not.toThrow();
  });

  test("throws a typed ProviderError when the signal is aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(ProviderError);
  });
});

describe("normalizeVector", () => {
  test("returns a unit-length vector (cosine with itself ≈ 1)", () => {
    const out = normalizeVector(Float32Array.from([3, 4]));
    expect(cosineSim(out, out)).toBeCloseTo(1, 6);
    // 3-4-5 triangle → [0.6, 0.8].
    expect(out[0]).toBeCloseTo(0.6, 6);
    expect(out[1]).toBeCloseTo(0.8, 6);
  });

  test("leaves a zero vector unchanged (no divide-by-zero NaN)", () => {
    const out = normalizeVector(Float32Array.from([0, 0, 0]));
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });
});

describe("createMemo", () => {
  const noDispose = (): void => undefined;

  test("memoizes a successful load — one load per id, shared across concurrent + later calls", async () => {
    const load = vi.fn(async (id: string) => `model:${id}`);
    const memo = createMemo(load, noDispose);

    const [a, b] = await Promise.all([memo("x"), memo("x")]);
    const c = await memo("x");

    expect(a).toBe("model:x");
    expect(b).toBe("model:x");
    expect(c).toBe("model:x");
    // Concurrent + subsequent callers share the ONE in-flight/resolved load.
    expect(load).toHaveBeenCalledTimes(1);
  });

  // THE PREFETCH'S LOAD-BEARING PROPERTY (#2403). `preload` calls `memo(id)`; every inference method calls
  // `memo.withLease(id, …)`. This pins that the two share ONE entry, which is the whole mechanism behind "a
  // request arriving mid-download waits on that download instead of starting a second" — a property that
  // cannot be asserted against the real transformers.js loader without actually downloading 3.5 GB.
  test("a preload (memo) and an inference lease of the same id share ONE load", async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const load = vi.fn(async (id: string) => {
      started.resolve();
      await release.promise;
      return `model:${id}`;
    });
    const memo = createMemo(load, noDispose);

    // The prefetch's door, still in flight …
    const preloading = memo("x");
    await started.promise;
    // … and a request arriving mid-download through the inference door.
    const inferring = memo.withLease("x", (value) => Promise.resolve(value));

    release.resolve();
    await expect(preloading).resolves.toBe("model:x");
    await expect(inferring).resolves.toBe("model:x");
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("does NOT cache a rejected load — a later call retries (no failure poisoning)", async () => {
    const load = vi.fn((id: string) =>
      load.mock.calls.length === 1 ? Promise.reject(new Error("Unable to get model file path or buffer.")) : Promise.resolve(`model:${id}`),
    );
    const memo = createMemo(load, noDispose);

    await expect(memo("x")).rejects.toThrow("Unable to get model file path or buffer.");
    // Let the eviction `.catch` clear the rejected entry before the retry.
    await flush();

    // The retry re-attempts the load (the transient failure did not poison the model) and succeeds.
    await expect(memo("x")).resolves.toBe("model:x");
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("concurrent callers of a failing load all reject without an unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const onRej = (err: unknown): void => {
      rejections.push(err);
    };
    process.on("unhandledRejection", onRej);
    try {
      const load = vi.fn(() => Promise.reject(new Error("boom")));
      const memo = createMemo(load, noDispose);

      const results = await Promise.allSettled([memo("x"), memo("x"), memo("x")]);
      await flush();

      expect(results.every((r) => r.status === "rejected")).toBe(true);
      // The three concurrent calls shared ONE load; the eviction `.catch` owns the memoized rejection.
      expect(load).toHaveBeenCalledTimes(1);
      expect(rejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onRej);
    }
  });

  test("evicts + disposes the oldest resident model past the cap", async () => {
    const disposed: string[] = [];
    const load = vi.fn(async (id: string) => `model:${id}`);
    const memo = createMemo(load, (value: string) => {
      disposed.push(value);
    });

    // Cap is 4; requesting a 5th distinct model evicts the oldest (insertion order). Eviction is decided
    // synchronously at call time, so request all five, then await their loads + the dispose microtask.
    await Promise.all(["a", "b", "c", "d", "e"].map((id) => memo(id)));
    await flush();

    expect(disposed).toEqual(["model:a"]);
  });

  test("defers eviction disposal until an active lease releases the model", async () => {
    const disposed: string[] = [];
    const memo = createMemo(
      async (id: string) => `model:${id}`,
      (value) => disposed.push(value),
    );
    const held = Promise.withResolvers<void>();
    const usingOldest = memo.withLease("a", async (value) => {
      expect(value).toBe("model:a");
      await held.promise;
    });
    await Promise.resolve();
    await Promise.all(["b", "c", "d", "e"].map((id) => memo(id)));
    await flush();
    expect(disposed).toEqual([]);
    held.resolve();
    await usingOldest;
    await flush();
    expect(disposed).toEqual(["model:a"]);
  });
});
