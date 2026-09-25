// The Prompt caching tier's pure folds: when the tier shows, the changed-field count, and the depth field's
// commit mapping. The shape and its bounds are the contract's.

import type { Capability } from "@orb/contracts/inference";
import { GENERATION_FLOOR, PROMPT_CACHE_DEPTH_CEIL, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import {
  PROMPT_CACHE_TTL_OPTIONS,
  promptCacheChangedCount,
  promptCacheDepthOf,
  promptCacheTtlOf,
  showsPromptCache,
} from "../../../../../packages/client/src/features/credentials/lib/prompt-cache-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function generation(explicitPromptCache: boolean | undefined): Capability {
  return {
    kind: "generation",
    generation: {
      ...GENERATION_FLOOR,
      ...(explicitPromptCache === undefined
        ? {}
        : { turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache } }),
    },
  };
}

test("the tier shows only where the capability places explicit cache markers", () => {
  expect(showsPromptCache(generation(true))).toBe(true);
  expect(showsPromptCache(generation(false))).toBe(false);
  expect(showsPromptCache(generation(undefined))).toBe(false);
  expect(showsPromptCache(null)).toBe(false);
});

test("the badge counts the fields that differ from the shipped behavior; a NULL row is zero", () => {
  expect(promptCacheChangedCount(null)).toBe(0);
  expect(promptCacheChangedCount(SHIPPED_PROMPT_CACHE)).toBe(0);
  expect(promptCacheChangedCount({ ...SHIPPED_PROMPT_CACHE, ttl: "5m", historyDepth: 3 })).toBe(2);
});

test("the depth field: empty is automatic, an in-range whole number writes, anything else writes nothing", () => {
  expect(promptCacheDepthOf(null)).toBeNull();
  expect(promptCacheDepthOf(4)).toBe(4);
  expect(promptCacheDepthOf(0)).toBeUndefined();
  expect(promptCacheDepthOf(PROMPT_CACHE_DEPTH_CEIL + 1)).toBeUndefined();
  expect(promptCacheDepthOf(2.5)).toBeUndefined();
});

test("the TTL options follow the contract tuple and carry its write price; only a tuple member narrows", () => {
  expect(PROMPT_CACHE_TTL_OPTIONS.map((option) => [option.value, option.writeCost])).toEqual([
    ["5m", "1.25×"],
    ["1h", "2×"],
  ]);
  expect(promptCacheTtlOf("5m")).toBe("5m");
  expect(promptCacheTtlOf("9z")).toBeUndefined();
});
