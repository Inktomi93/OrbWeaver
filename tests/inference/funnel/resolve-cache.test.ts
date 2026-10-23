import { cachePolicyContextSchema, cachePolicySchema, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
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
