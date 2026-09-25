// @orb/contracts/inference prompt-cache — the connection's cache settings as they cross the wire. The bounds are
// the API's: two TTLs (an unknown one makes OpenRouter silently drop the whole block), a user depth from 1 (depth
// 0 is the volatile tail) to the shared lookback ceiling. NULL on the row is the shipped behavior, byte-identical.

import {
  effectivePromptCache,
  PROMPT_CACHE_DEPTH_CEIL,
  PROMPT_CACHE_DEPTH_MIN,
  PROMPT_CACHE_TTLS,
  PROMPT_CACHE_WRITE_MULTIPLIER,
  promptCacheSettingsSchema,
  SHIPPED_PROMPT_CACHE,
} from "@orb/contracts/inference";
import { PROMPT_CACHE_MIN_DEPTH_CEIL } from "@orb/contracts/settings";
import { expect, test } from "../../support/fixtures.ts";

const SET = { enabled: true, cacheSystem: true, historyDepth: null, ttl: "5m" };

test("the shipped settings are today's wire: on, system cached, the turn's own depth, 1h", () => {
  expect(SHIPPED_PROMPT_CACHE).toEqual({ enabled: true, cacheSystem: true, historyDepth: null, ttl: "1h" });
  expect(effectivePromptCache(null)).toEqual(SHIPPED_PROMPT_CACHE);
  const stored = promptCacheSettingsSchema.parse(SET);
  expect(effectivePromptCache(stored)).toBe(stored);
});

test("the ttl is exactly the two the Anthropic cache accepts", () => {
  expect(PROMPT_CACHE_TTLS).toEqual(["5m", "1h"]);
  for (const ttl of PROMPT_CACHE_TTLS) {
    expect(promptCacheSettingsSchema.parse({ ...SET, ttl }).ttl).toBe(ttl);
  }
  expect(promptCacheSettingsSchema.safeParse({ ...SET, ttl: "9z" }).success).toBe(false);
  expect(promptCacheSettingsSchema.safeParse({ ...SET, ttl: "5M" }).success).toBe(false);
});

test("the write multipliers are the published prices: 5m 1.25x, 1h 2x base input", () => {
  expect(PROMPT_CACHE_WRITE_MULTIPLIER).toEqual({ "5m": 1.25, "1h": 2 });
});

test("the user depth is an integer from 1 to the ceiling the admin floor shares, or null", () => {
  expect(PROMPT_CACHE_MIN_DEPTH_CEIL).toBe(PROMPT_CACHE_DEPTH_CEIL);
  expect(promptCacheSettingsSchema.parse({ ...SET, historyDepth: PROMPT_CACHE_DEPTH_MIN }).historyDepth).toBe(1);
  expect(promptCacheSettingsSchema.parse({ ...SET, historyDepth: PROMPT_CACHE_DEPTH_CEIL }).historyDepth).toBe(20);
  expect(promptCacheSettingsSchema.safeParse({ ...SET, historyDepth: 0 }).success).toBe(false);
  expect(promptCacheSettingsSchema.safeParse({ ...SET, historyDepth: PROMPT_CACHE_DEPTH_CEIL + 1 }).success).toBe(false);
  expect(promptCacheSettingsSchema.safeParse({ ...SET, historyDepth: 2.5 }).success).toBe(false);
});

test("every field is required: a partial document is refused, never half-defaulted", () => {
  expect(promptCacheSettingsSchema.safeParse({ enabled: true }).success).toBe(false);
  expect(promptCacheSettingsSchema.safeParse({ ...SET, cacheSystem: undefined }).success).toBe(false);
});
