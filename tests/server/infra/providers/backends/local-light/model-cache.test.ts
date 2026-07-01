// Unit tests for the local-light model-cache's exported pure helpers — `resolveModelId` (default-model
// fallback), `throwIfAborted` (typed abort belt), and `normalizeVector` (owned, unit-length output).
// The transformers.js/ONNX load + inference paths are exercised by the gated `*.int.test.ts` files.

import { cosineSim } from "@orb/kit/vector-math";
import { ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
// The cache's pure helpers are slice-internal (not on the family barrel), so import them via the
// mirror-relative source path rather than the `@orb/server/*` (index-only) export map.
import {
  normalizeVector,
  resolveModelId,
  throwIfAborted,
} from "../../../../../../packages/server/src/infra/providers/backends/local-light/model-cache.ts";
import { expect, test } from "../../../../../support/fixtures";

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
