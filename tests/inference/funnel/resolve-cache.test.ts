import type { CachePolicyContext, GenerationCapability } from "@orb/contracts/inference";
import { GENERATION_FLOOR, modelIdSchema, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { resolveCachePolicy } from "../../../packages/inference/src/funnel/resolve-cache.ts";
import { expect, test } from "../../support/fixtures.ts";

const CONTEXT: CachePolicyContext = {
  wire: "openai-compat",
  dialect: "openrouter",
  factsModel: modelIdSchema.parse("anthropic/claude-sonnet-5"),
  promptSettings: { ...SHIPPED_PROMPT_CACHE, enabled: false },
  responseReplaySupported: true,
  configuredReplay: {},
  configuredRetention: { owned: false, value: null },
};

test("unsupported enabled prefix controls report a cache adjustment, not an SDK sampling failure", () => {
  const context: CachePolicyContext = { ...CONTEXT, dialect: "openai-compatible", promptSettings: SHIPPED_PROMPT_CACHE };
  const resolved = resolveCachePolicy({ context, generation: GENERATION_FLOOR });
  expect(resolved.plan.prefix.action).toBe("none");
  expect(resolved.warnings).toEqual([
    {
      code: "cache_control_adjusted",
      message: "App-authored prefix markers are unsupported on this route; provider implicit caching, if available, is unchanged",
    },
  ]);
  const disabled = resolveCachePolicy({ context: { ...context, promptSettings: { ...SHIPPED_PROMPT_CACHE, enabled: false } }, generation: GENERATION_FLOOR });
  expect(disabled.plan.prefix.action).toBe("none");
  expect(disabled.warnings).toEqual([]);
});

test("legacy retention is model-admitted, inherited when unset, and respects normalized configured-body ownership", () => {
  const generation: GenerationCapability = {
    ...GENERATION_FLOOR,
    turns: {
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: false,
      promptCacheRetentions: ["24h"],
    },
  };
  const context = { ...CONTEXT, promptSettings: { ...CONTEXT.promptSettings, retention: "24h" as const } };
  expect(resolveCachePolicy({ context, generation }).plan.implicit.retention).toBe("24h");
  expect(resolveCachePolicy({ context: CONTEXT, generation }).plan.implicit.retention).toBeNull();
  const unsupported = resolveCachePolicy({ context, generation: GENERATION_FLOOR });
  expect(unsupported.plan.implicit.retention).toBeNull();
  expect(unsupported.warnings[0]?.message).toContain("no retention control was applied");
  const excluded = resolveCachePolicy({ context: { ...context, configuredRetention: { owned: true, value: null } }, generation });
  expect(excluded.plan.implicit.retention).toBeNull();
  expect(excluded.warnings[0]?.message).toContain("custom body owns");
});

test("fresh and explicit replay controls override preset/header enable without refreshing shared entries", () => {
  const context = { ...CONTEXT, configuredReplay: { enabled: true, ttlSeconds: 60, refresh: true } };
  expect(resolveCachePolicy({ context }).plan.replay).toEqual({ supported: true, enabled: true, ttlSeconds: 60, refresh: true, provenance: "connection" });
  expect(resolveCachePolicy({ context, preset: { enabled: false } }).plan.replay).toMatchObject({ enabled: false, refresh: false, provenance: "preset" });
  const override = resolveCachePolicy({ context, preset: { enabled: false, ttlSeconds: 120 }, request: { enabled: true, ttlSeconds: 300 } });
  expect(override.plan.replay).toMatchObject({ enabled: true, ttlSeconds: 300, provenance: "request" });
  const fresh = resolveCachePolicy({ context, preset: { enabled: true }, request: { enabled: true, refresh: true }, fresh: true });
  expect(fresh.plan.replay).toMatchObject({ enabled: false, refresh: false, provenance: "fresh" });
  expect(resolveCachePolicy({ context: CONTEXT }).plan.replay).toMatchObject({ enabled: false, provenance: "default" });
});

test("app prefix controls off neither claim nor disable provider automatic caching", () => {
  const generation: GenerationCapability = {
    ...GENERATION_FLOOR,
    turns: {
      ...GENERATION_FLOOR.turns,
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: false,
      providerImplicitPromptCache: true,
    },
  };
  const resolved = resolveCachePolicy({ context: { ...CONTEXT, promptSettings: { ...CONTEXT.promptSettings, disableImplicit: true } }, generation });
  expect(resolved.plan.prefix.action).toBe("none");
  expect(resolved.plan.implicit).toMatchObject({ supported: true, disableApplied: false, minimumRetentionSeconds: null });
  expect(resolved.warnings.map((warning) => warning.message)).toEqual([
    "This route cannot disable provider implicit caching; no implicit-disable control was applied",
  ]);
  expect(resolveCachePolicy({ context: CONTEXT }).plan.implicit.supported).toBeNull();
});

test("request automatic caching is opt-in and explains why saved manual controls no longer apply", () => {
  const generation: GenerationCapability = {
    ...GENERATION_FLOOR,
    turns: {
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: true,
      requestAutomaticPromptCache: true,
    },
  };
  const context = { ...CONTEXT, promptSettings: { ...SHIPPED_PROMPT_CACHE, requestAutomatic: true, historyDepth: 4 } };
  const automatic = resolveCachePolicy({ context, generation, requestedDepth: 2 });
  expect(automatic.plan.prefix).toMatchObject({ action: "automatic-request", historyDepth: null, cacheSystem: false, preservesBlockEnds: true, ttl: "1h" });
  expect(automatic.warnings.map((warning) => warning.message)).toEqual([
    "Request-wide automatic prefix caching replaces manual system/history breakpoints; their saved settings are not applied",
  ]);
  const unsupported = resolveCachePolicy({ context, generation: GENERATION_FLOOR });
  expect(unsupported.plan.prefix.action).toBe("none");
  expect(unsupported.warnings[0]?.message).toContain("unsupported on this route");
});

test("manual prefix retention facts do not fabricate provider-implicit retention", () => {
  const generation: GenerationCapability = {
    ...GENERATION_FLOOR,
    turns: {
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: true,
      providerImplicitPromptCache: false,
      cacheRetentionSeconds: 300,
      cacheRetentionRefresh: true,
    },
  };
  expect(resolveCachePolicy({ context: CONTEXT, generation }).plan.implicit).toEqual({
    supported: false,
    disableApplied: false,
    minimumRetentionSeconds: null,
    refreshOnHit: null,
    retention: null,
  });
});

test("manual depth is a floor, absent safe depth stays absent, and route retention overrides are reported", () => {
  const generation: GenerationCapability = {
    ...GENERATION_FLOOR,
    turns: {
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: true,
      fixedCacheTtl: "5m",
    },
  };
  const context = { ...CONTEXT, promptSettings: { ...SHIPPED_PROMPT_CACHE, historyDepth: 5 } };
  const manual = resolveCachePolicy({ context, generation, requestedDepth: 2 });
  expect(manual.plan.prefix).toMatchObject({ action: "markers", historyDepth: 5, ttl: "5m" });
  expect(manual.warnings[0]?.message).toContain("saved 1h setting was not applied");
  expect(resolveCachePolicy({ context, generation }).plan.prefix.historyDepth).toBeNull();
});

test("unsupported replay remains unapplied and malformed typed retention refuses before wire spelling", () => {
  const unsupported = resolveCachePolicy({ context: { ...CONTEXT, responseReplaySupported: false }, preset: { enabled: true } });
  expect(unsupported.plan.replay).toMatchObject({ supported: false, enabled: false, refresh: false });
  expect(unsupported.warnings[0]?.message).toContain("unsupported on this endpoint");
  expect(() => resolveCachePolicy({ context: CONTEXT, request: { ttlSeconds: 0 } })).toThrow("Invalid response-cache control");
});
