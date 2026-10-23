import { cachePolicySchema } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";

const POLICY = cachePolicySchema.parse({
  prefix: { action: "none", format: null, ttl: null, cacheSystem: false, historyDepth: null, preservesBlockEnds: false },
  implicit: { supported: null, disableApplied: false, minimumRetentionSeconds: null, refreshOnHit: null, retention: null },
  replay: { supported: false, enabled: false, ttlSeconds: null, refresh: false, provenance: "default" },
});

test("prefix variants admit their exact applied controls without changing nullable facts", () => {
  for (const prefix of [
    POLICY.prefix,
    { action: "automatic-request", format: null, ttl: "1h", cacheSystem: false, historyDepth: null, preservesBlockEnds: true },
    { action: "markers", format: "cache-control", ttl: "5m", cacheSystem: true, historyDepth: 4, preservesBlockEnds: true },
  ]) {
    expect(cachePolicySchema.parse({ ...POLICY, prefix }).prefix).toEqual(prefix);
  }
});

test("an inactive prefix cannot claim any applied retention, marker or preserved block boundary", () => {
  for (const change of [{ ttl: "5m" }, { cacheSystem: true }, { historyDepth: 1 }, { preservesBlockEnds: true }]) {
    expect(cachePolicySchema.safeParse({ ...POLICY, prefix: { ...POLICY.prefix, ...change } }).success).toBe(false);
  }
});

test("automatic placement cannot carry manual system or history markers", () => {
  const prefix = { ...POLICY.prefix, action: "automatic-request" };
  expect(cachePolicySchema.parse({ ...POLICY, prefix }).prefix).toEqual(prefix);
  for (const change of [{ cacheSystem: true }, { historyDepth: 1 }]) {
    expect(cachePolicySchema.safeParse({ ...POLICY, prefix: { ...prefix, ...change } }).success).toBe(false);
  }
});

test("manual markers require a format and refuse invalid or fractional history depth", () => {
  const prefix = { ...POLICY.prefix, action: "markers", format: "openai-breakpoint" };
  expect(cachePolicySchema.parse({ ...POLICY, prefix }).prefix).toEqual(prefix);
  expect(cachePolicySchema.parse({ ...POLICY, prefix: { ...prefix, historyDepth: 0 } }).prefix).toEqual({ ...prefix, historyDepth: 0 });
  for (const change of [{ format: null }, { format: "invalid-format" }, { historyDepth: -1 }, { historyDepth: 0.5 }]) {
    expect(cachePolicySchema.safeParse({ ...POLICY, prefix: { ...prefix, ...change } }).success).toBe(false);
  }
});

test("the prefix action vocabulary stays closed at the actual policy boundary", () => {
  expect(cachePolicySchema.safeParse({ ...POLICY, prefix: { ...POLICY.prefix, action: "unknown-action" } }).success).toBe(false);
});
