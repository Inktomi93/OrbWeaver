import { cachePolicyContextSchema, cachePolicySchema, GENERATION_FLOOR, generationCapabilitySchema, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { resolveCachePolicy } from "@orb/inference";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("unsupported replay retains configured retention while the producer clears effective controls", () => {
  const context = cachePolicyContextSchema.parse({
    wire: "anthropic-messages",
    dialect: null,
    factsModel: "unknown-provider-model",
    promptSettings: { ...SHIPPED_PROMPT_CACHE, enabled: false },
    responseReplaySupported: false,
    configuredReplay: { enabled: true, refresh: true, ttlSeconds: 300 },
    configuredRetention: { owned: true, value: "24h" },
  });
  const resolved = resolveCachePolicy({ context });
  expect(cachePolicySchema.parse(resolved.plan)).toEqual(resolved.plan);
  expect(resolved.plan.prefix).toEqual({
    action: "none",
    format: "cache-control",
    ttl: null,
    cacheSystem: false,
    historyDepth: null,
    preservesBlockEnds: false,
  });
  expect(resolved.plan.implicit).toEqual({ supported: null, disableApplied: false, minimumRetentionSeconds: null, refreshOnHit: null, retention: "24h" });
  expect(resolved.plan.replay).toEqual({ supported: false, enabled: false, ttlSeconds: 300, refresh: false, provenance: "connection" });
});

test("supported automatic placement replaces saved manual controls and an unsupported route applies none", () => {
  const context = cachePolicyContextSchema.parse({
    wire: "anthropic-messages",
    dialect: null,
    factsModel: "unknown-provider-model",
    promptSettings: { ...SHIPPED_PROMPT_CACHE, requestAutomatic: true, historyDepth: 4 },
    responseReplaySupported: false,
    configuredReplay: {},
    configuredRetention: { owned: false, value: null },
  });
  const generation = generationCapabilitySchema.parse({
    ...GENERATION_FLOOR,
    turns: { ...GENERATION_FLOOR.turns, explicitPromptCache: true, requestAutomaticPromptCache: true },
  });
  const automatic = resolveCachePolicy({ context, generation, requestedDepth: 2 });
  expect(cachePolicySchema.parse(automatic.plan)).toEqual(automatic.plan);
  expect(automatic.plan.prefix).toEqual({
    action: "automatic-request",
    format: "cache-control",
    ttl: "1h",
    cacheSystem: false,
    historyDepth: null,
    preservesBlockEnds: true,
  });
  expect(automatic.warnings).toEqual([
    {
      code: "cache_control_adjusted",
      message: "Request-wide automatic prefix caching replaces manual system/history breakpoints; their saved settings are not applied",
    },
  ]);
  const unsupported = resolveCachePolicy({ context, generation: GENERATION_FLOOR });
  expect(cachePolicySchema.parse(unsupported.plan)).toEqual(unsupported.plan);
  expect(unsupported.plan.prefix).toEqual({
    action: "none",
    format: "cache-control",
    ttl: null,
    cacheSystem: false,
    historyDepth: null,
    preservesBlockEnds: false,
  });
  expect(unsupported.warnings).toEqual([
    {
      code: "cache_control_adjusted",
      message: "Request-wide automatic prefix caching is unsupported on this route; no automatic request control was applied",
    },
  ]);
});

test("manual placement respects the saved depth floor, absent safe depth and fixed route retention", () => {
  const context = cachePolicyContextSchema.parse({
    wire: "anthropic-messages",
    dialect: null,
    factsModel: "unknown-provider-model",
    promptSettings: { ...SHIPPED_PROMPT_CACHE, historyDepth: 5 },
    responseReplaySupported: false,
    configuredReplay: {},
    configuredRetention: { owned: false, value: null },
  });
  const generation = generationCapabilitySchema.parse({
    ...GENERATION_FLOOR,
    turns: { ...GENERATION_FLOOR.turns, explicitPromptCache: true, fixedCacheTtl: "5m" },
  });
  const manual = resolveCachePolicy({ context, generation, requestedDepth: 2 });
  expect(cachePolicySchema.parse(manual.plan)).toEqual(manual.plan);
  expect(manual.plan.prefix).toEqual({
    action: "markers",
    format: "cache-control",
    ttl: "5m",
    cacheSystem: true,
    historyDepth: 5,
    preservesBlockEnds: true,
  });
  expect(manual.warnings).toEqual([
    { code: "cache_control_adjusted", message: "This route applies 5m prefix retention; the saved 1h setting was not applied" },
  ]);
  const withoutSafeDepth = resolveCachePolicy({ context, generation });
  expect(cachePolicySchema.parse(withoutSafeDepth.plan)).toEqual(withoutSafeDepth.plan);
  expect(withoutSafeDepth.plan.prefix).toEqual({ ...manual.plan.prefix, historyDepth: null });
});
