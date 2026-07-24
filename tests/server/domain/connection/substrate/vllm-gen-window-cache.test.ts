// Unit tests for the engine-keyed vLLM window cache (#14 — extends the gen-window cache to embed + rerank).
// The engine's self-reported window is cached per engine with an injected clock; a fresh entry WINS, a
// stale one (past TTL) returns null so the consumer falls back to the env floor, and engines are independent.

import { afterEach, describe } from "vitest";
import {
  __resetVllmGenWindowCache,
  getCachedVllmGenWindow,
  getCachedVllmWindow,
  seedVllmGenWindow,
  seedVllmWindow,
} from "../../../../../packages/server/src/domain/connection/substrate/vllm-gen-window-cache.ts";
import { expect, test } from "../../../../support/fixtures";

const HOUR_MS = 3_600_000;

afterEach(() => __resetVllmGenWindowCache());

describe("engine-keyed vLLM window cache", () => {
  test("a freshly-seeded window is returned within TTL (self-report wins)", () => {
    seedVllmWindow("embed", 8192, 0);
    expect(getCachedVllmWindow("embed", HOUR_MS - 1)).toBe(8192);
  });

  test("a stale entry (past TTL) returns null → consumer falls back to the env floor", () => {
    seedVllmWindow("embed", 8192, 0);
    expect(getCachedVllmWindow("embed", HOUR_MS)).toBeNull();
  });

  test("engines cache independently — embed doesn't leak into rerank", () => {
    seedVllmWindow("embed", 8192, 0);
    expect(getCachedVllmWindow("rerank", 0)).toBeNull();
    seedVllmWindow("rerank", 16_384, 0);
    expect(getCachedVllmWindow("rerank", 0)).toBe(16_384);
    expect(getCachedVllmWindow("embed", 0)).toBe(8192);
  });

  test("the gen-specific wrappers target the gen engine key", () => {
    seedVllmGenWindow(65_536, 0);
    expect(getCachedVllmGenWindow(0)).toBe(65_536);
    expect(getCachedVllmWindow("gen", 0)).toBe(65_536);
  });
});
