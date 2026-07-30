// The in-memory agent-sdk daemon catalog MIRROR — the warm-on-seed + injected-clock stale-ceiling behavior.
// Mirrors or-model-cache.test.ts: the clock is INJECTED (passed to getCachedAgentSdkModels), never the wall
// clock; the seed timestamp is the snapshot's own fetchedAt, so expiry is measured against the caller's
// clock. The TTL is a very-stale sanity CEILING (a week ≥ the daily refresh cadence), NOT a per-hour
// freshness gate: a day-old snapshot stays served so max-pro-sub/OR-skin reasoning capability survives a
// cold/restarted process (the bug was a 1h TTL expiring before the daily refresh could re-warm — see
// agent-sdk-model-cache.ts header). SEPARATE cache from the OR one (OR ≠ agent-sdk).

import type { AgentSdkModel } from "@orb/contracts/connection";
import { afterEach, describe } from "vitest";
import {
  __resetAgentSdkModelCache,
  getCachedAgentSdkModels,
  seedAgentSdkModelCache,
} from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { expect, test } from "../../../../support/fixtures";

const FETCHED_AT = 1_750_000_000_000;
const MS_PER_HOUR = 3_600_000;
const TTL_MS = 604_800_000; // mirrors AGENT_SDK_CATALOG_TTL_MS (a week — the stale ceiling ≥ daily cadence)
const MODELS: AgentSdkModel[] = [
  {
    alias: "sonnet",
    resolvedModel: "claude-sonnet-5",
    displayName: "Sonnet",
    description: "Sonnet 5",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    supportsAdaptiveThinking: false,
  },
];

afterEach(() => {
  __resetAgentSdkModelCache();
});

describe("agent-sdk-model-cache (injected-clock stale ceiling)", () => {
  test("cold cache returns null (never fetches)", () => {
    expect(getCachedAgentSdkModels(FETCHED_AT)).toBeNull();
  });

  test("seed then read within the ceiling returns the models", () => {
    seedAgentSdkModelCache(MODELS, FETCHED_AT);
    expect(getCachedAgentSdkModels(FETCHED_AT)).toEqual(MODELS);
    expect(getCachedAgentSdkModels(FETCHED_AT + TTL_MS - 1)).toEqual(MODELS);
  });

  // The regression: a snapshot older than an hour (and even a full day) MUST still be served — the daily
  // refresh cadence re-warms far slower than the old 1h TTL expired, so expiring here dropped daemon reasoning.
  test("a snapshot hours/a-day old still serves (not expired like the old 1h TTL)", () => {
    seedAgentSdkModelCache(MODELS, FETCHED_AT);
    expect(getCachedAgentSdkModels(FETCHED_AT + MS_PER_HOUR)).toEqual(MODELS);
    expect(getCachedAgentSdkModels(FETCHED_AT + MS_PER_HOUR * 2)).toEqual(MODELS);
    expect(getCachedAgentSdkModels(FETCHED_AT + TTL_MS - MS_PER_HOUR)).toEqual(MODELS);
  });

  test("read AT or past the ceiling (relative to the injected clock) returns null", () => {
    seedAgentSdkModelCache(MODELS, FETCHED_AT);
    expect(getCachedAgentSdkModels(FETCHED_AT + TTL_MS)).toBeNull();
    expect(getCachedAgentSdkModels(FETCHED_AT + TTL_MS + 1)).toBeNull();
  });
});
