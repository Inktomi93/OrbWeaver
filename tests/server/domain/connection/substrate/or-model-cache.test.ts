// The in-memory OR catalog MIRROR — the warm-on-seed + injected-clock stale-ceiling behavior. The clock is
// INJECTED (passed to getCachedOrModels), never the wall clock; the seed timestamp is the snapshot's own
// fetchedAt, so expiry is measured against the caller's clock. The TTL is a very-stale sanity CEILING
// (a week ≥ the daily refresh cadence), NOT a per-hour freshness gate: a day-old snapshot stays served so
// OR capability flags survive a cold/restarted process (the bug was a 1h TTL expiring before the daily
// refresh could re-warm — see or-model-cache.ts header).

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { afterEach, describe } from "vitest";
import { __resetOrModelCache, getCachedOrModels, seedOrModelCache } from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const FETCHED_AT = 1_750_000_000_000;
const MS_PER_HOUR = 3_600_000;
const TTL_MS = 604_800_000; // mirrors OR_CATALOG_TTL_MS (a week — the stale ceiling ≥ daily cadence)
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

describe("or-model-cache (injected-clock stale ceiling)", () => {
  test("cold cache returns null (never fetches)", () => {
    expect(getCachedOrModels(FETCHED_AT)).toBeNull();
  });

  test("seed then read within the ceiling returns the models", () => {
    seedOrModelCache(MODELS, FETCHED_AT);
    expect(getCachedOrModels(FETCHED_AT)).toEqual(MODELS);
    expect(getCachedOrModels(FETCHED_AT + TTL_MS - 1)).toEqual(MODELS);
  });

  // The regression: a snapshot older than an hour (and even a full day) MUST still be served — the daily
  // refresh cadence re-warms far slower than the old 1h TTL expired, so expiring here dropped OR capability.
  test("a snapshot hours/a-day old still serves (not expired like the old 1h TTL)", () => {
    seedOrModelCache(MODELS, FETCHED_AT);
    expect(getCachedOrModels(FETCHED_AT + MS_PER_HOUR)).toEqual(MODELS);
    expect(getCachedOrModels(FETCHED_AT + MS_PER_HOUR * 2)).toEqual(MODELS);
    expect(getCachedOrModels(FETCHED_AT + TTL_MS - MS_PER_HOUR)).toEqual(MODELS);
  });

  test("read AT or past the ceiling (relative to the injected clock) returns null", () => {
    seedOrModelCache(MODELS, FETCHED_AT);
    expect(getCachedOrModels(FETCHED_AT + TTL_MS)).toBeNull();
    expect(getCachedOrModels(FETCHED_AT + TTL_MS + 1)).toBeNull();
  });
});
