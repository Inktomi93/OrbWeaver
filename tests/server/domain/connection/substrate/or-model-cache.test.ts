// The in-memory TTL OR catalog cache — the warm-on-read +
// injected-clock TTL behavior. The clock is INJECTED (passed to getCachedOrModels), never the wall clock;
// the seed timestamp is the snapshot's own fetchedAt, so expiry is measured against the caller's clock.

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { afterEach, describe } from "vitest";
import {
  __resetOrModelCache,
  getCachedOrModels,
  seedOrModelCache,
} from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { expect, test } from "../../../../support/fixtures";

const FETCHED_AT = 1_750_000_000_000;
const TTL_MS = 3_600_000; // mirrors OR_CATALOG_TTL_MS
const MODELS: ModelCatalogEntry[] = [
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    contextLength: 128_000,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: ["text"],
    supportedParameters: ["temperature"],
  },
];

afterEach(() => {
  __resetOrModelCache();
});

describe("or-model-cache (injected-clock TTL)", () => {
  test("cold cache returns null (never fetches)", () => {
    expect(getCachedOrModels(FETCHED_AT)).toBeNull();
  });

  test("seed then read within TTL returns the models", () => {
    seedOrModelCache(MODELS, FETCHED_AT);
    expect(getCachedOrModels(FETCHED_AT)).toEqual(MODELS);
    expect(getCachedOrModels(FETCHED_AT + TTL_MS - 1)).toEqual(MODELS);
  });

  test("read AT or past the TTL (relative to the injected clock) returns null", () => {
    seedOrModelCache(MODELS, FETCHED_AT);
    expect(getCachedOrModels(FETCHED_AT + TTL_MS)).toBeNull();
    expect(getCachedOrModels(FETCHED_AT + TTL_MS + 1)).toBeNull();
  });
});
