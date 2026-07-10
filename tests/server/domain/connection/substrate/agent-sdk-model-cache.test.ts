// The in-memory TTL agent-sdk daemon catalog cache — the warm-on-read + injected-clock TTL behavior.
// Mirrors or-model-cache.test.ts: the clock is INJECTED (passed to getCachedAgentSdkModels), never the wall
// clock; the seed timestamp is the snapshot's own fetchedAt, so expiry is measured against the caller's
// clock. SEPARATE cache from the OR one (OR ≠ agent-sdk).

import type { AgentSdkModel } from "@orb/contracts/connection";
import { afterEach, describe } from "vitest";
import {
  __resetAgentSdkModelCache,
  getCachedAgentSdkModels,
  seedAgentSdkModelCache,
} from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { expect, test } from "../../../../support/fixtures";

const FETCHED_AT = 1_750_000_000_000;
const TTL_MS = 3_600_000; // mirrors AGENT_SDK_CATALOG_TTL_MS
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

describe("agent-sdk-model-cache (injected-clock TTL)", () => {
  test("cold cache returns null (never fetches)", () => {
    expect(getCachedAgentSdkModels(FETCHED_AT)).toBeNull();
  });

  test("seed then read within TTL returns the models", () => {
    seedAgentSdkModelCache(MODELS, FETCHED_AT);
    expect(getCachedAgentSdkModels(FETCHED_AT)).toEqual(MODELS);
    expect(getCachedAgentSdkModels(FETCHED_AT + TTL_MS - 1)).toEqual(MODELS);
  });

  test("read AT or past the TTL (relative to the injected clock) returns null", () => {
    seedAgentSdkModelCache(MODELS, FETCHED_AT);
    expect(getCachedAgentSdkModels(FETCHED_AT + TTL_MS)).toBeNull();
    expect(getCachedAgentSdkModels(FETCHED_AT + TTL_MS + 1)).toBeNull();
  });
});
