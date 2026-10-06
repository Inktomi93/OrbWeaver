import { cachePolicyContextSchema, cachePolicySchema, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

const CONTEXT = {
  wire: "openai-compat",
  dialect: "openrouter",
  factsModel: "model",
  promptSettings: SHIPPED_PROMPT_CACHE,
  responseReplaySupported: true,
  configuredReplay: {},
  configuredRetention: { owned: false, value: null },
};
const POLICY = {
  prefix: { action: "none", format: null, ttl: null, cacheSystem: false, historyDepth: null, preservesBlockEnds: false },
  implicit: { supported: null, disableApplied: false, minimumRetentionSeconds: null, refreshOnHit: null, retention: null },
  replay: { supported: true, enabled: true, ttlSeconds: 1, refresh: false, provenance: "request" },
};

test("cache policy round-trips applied controls without fabricating hit, counters or provider authority", () => {
  expect(cachePolicyContextSchema.parse(JSON.parse(JSON.stringify(CONTEXT)))).toEqual(CONTEXT);
  expect(cachePolicySchema.parse(JSON.parse(JSON.stringify(POLICY)))).toEqual(POLICY);
  expect(cachePolicySchema.safeParse({ ...POLICY, status: "hit" }).success).toBe(false);
});

test("policy boundaries refuse arbitrary connection secrets, invalid retention and unsafe depth", () => {
  expect(cachePolicyContextSchema.safeParse({ ...CONTEXT, apiKey: "private" }).success).toBe(false);
  expect(cachePolicyContextSchema.safeParse({ ...CONTEXT, factsModel: "" }).success).toBe(false);
  expect(cachePolicySchema.safeParse({ ...POLICY, replay: { ...POLICY.replay, ttlSeconds: 0 } }).success).toBe(false);
  expect(cachePolicySchema.safeParse({ ...POLICY, prefix: { ...POLICY.prefix, historyDepth: -1 } }).success).toBe(false);
});
