import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelIdSchema, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { configuredResponseCache, responseCacheHeaders, responseCacheOf } from "../../../../packages/inference/src/backends/kit/response-cache.ts";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "../../../../packages/inference/src/backends/kit/sanitize.ts";
import type { ResolveCachePolicyInput } from "../../../../packages/inference/src/contract/resolve.ts";
import { resolveCachePolicy } from "../../../../packages/inference/src/funnel/resolve-cache.ts";
import { appendEvidence } from "../../../../scripts/probes/caching/evidence.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("probe file evidence scrubs reflected provider strings while preserving numeric facts and valid identity", () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-cache-sink-"));
  try {
    const secrets = resolvedScrubSet({
      credential: { secret: "opaque-evidence-key" },
      transport: {
        headers: { "X-Custom-Secret": "opaque-evidence-header", "X-Numeric-Secret": "7" },
        includeBody: { api_key: 'opaque-evidence-body-"quoted"' },
      },
    });
    const path = join(dir, "evidence.jsonl");
    appendEvidence(
      path,
      {
        cacheHeaders: { "x-openrouter-cache-source-id": "opaque-evidence-key", "x-generation-id": "gen-safe", "request-id": "opaque-evidence-header" },
        usage: { prompt_tokens: 7, cost: 0, extension: ['opaque-evidence-body-"quoted"', { "opaque-evidence-key": "opaque-evidence-header" }] },
      },
      secrets,
    );
    const raw = readFileSync(path, "utf8");
    expect(raw).not.toContain("opaque-evidence-key");
    expect(raw).not.toContain("opaque-evidence-header");
    expect(raw).not.toContain("opaque-evidence-body");
    expect(JSON.parse(raw)).toMatchObject({ cacheHeaders: { "x-generation-id": "gen-safe" }, usage: { prompt_tokens: 7, cost: 0 } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function headersFor(
  args: Pick<ResolveCachePolicyInput, "preset" | "request" | "fresh"> & { readonly configured?: Readonly<Record<string, string>> },
): Record<string, string> {
  const resolved = resolveCachePolicy({
    ...args,
    context: {
      wire: "openai-compat",
      dialect: "openrouter",
      factsModel: modelIdSchema.parse("openai/gpt-6-sol"),
      promptSettings: { ...SHIPPED_PROMPT_CACHE, enabled: false },
      responseReplaySupported: true,
      configuredReplay: configuredResponseCache(args.configured),
      configuredRetention: { owned: false, value: null },
    },
  });
  return responseCacheHeaders({ configured: args.configured, plan: resolved.plan });
}

test("raw OpenRouter TTL normalization accepts documented truncation/clamping and invalid fallthrough", () => {
  for (const [raw, normalized] of [
    ["60abc", 60],
    ["1.5", 1],
    ["900000000000000000000000", 86_400],
    ["0", 1],
  ] as const) {
    expect(configuredResponseCache({ "X-OpenRouter-Cache-TTL": raw }).ttlSeconds, raw).toBe(normalized);
  }
  for (const raw of ["garbage", ".5", ""]) {
    expect(configuredResponseCache({ "X-OpenRouter-Cache-TTL": raw }), raw).not.toHaveProperty("ttlSeconds");
  }
  expect(headersFor({ configured: { "X-OpenRouter-Cache-TTL": "60abc", "X-Unrelated": "kept" } })).toMatchObject({
    "x-openrouter-cache-ttl": "60",
    "x-unrelated": "kept",
  });
});

test("response replay override order preserves configured retention and unrelated headers", () => {
  const configured = { "X-OpenRouter-Cache": "true", "X-OpenRouter-Cache-TTL": "60", "X-Custom": "kept" };
  expect(headersFor({ configured })).toEqual({ "x-openrouter-cache": "true", "x-openrouter-cache-ttl": "60", "x-custom": "kept" });
  expect(headersFor({})).toEqual({ "x-openrouter-cache": "false" });
  expect(headersFor({ configured, preset: { enabled: false } })["x-openrouter-cache"]).toBe("false");
  expect(headersFor({ configured, preset: { enabled: false }, request: { enabled: true, ttlSeconds: 120, refresh: true } })).toMatchObject({
    "x-openrouter-cache": "true",
    "x-openrouter-cache-ttl": "120",
    "x-openrouter-cache-clear": "true",
    "x-custom": "kept",
  });
  expect(headersFor({ configured, preset: { enabled: true, ttlSeconds: 300 }, request: { enabled: false } })).toMatchObject({
    "x-openrouter-cache": "false",
    "x-openrouter-cache-ttl": "300",
  });
  const bypass = headersFor({ configured, preset: { enabled: true }, request: { enabled: true }, fresh: true });
  expect(bypass["x-openrouter-cache"]).toBe("false");
  expect(bypass).not.toHaveProperty("x-openrouter-cache-clear");
  expect(headersFor({ configured: { ...configured, "X-OpenRouter-Cache-Clear": "true" }, request: { refresh: false } })).not.toHaveProperty(
    "x-openrouter-cache-clear",
  );
});

test("invalid typed replay controls refuse instead of reaching the adapter", () => {
  expect(headersFor({ request: { ttlSeconds: 1 } })["x-openrouter-cache-ttl"]).toBe("1");
  expect(() => headersFor({ request: { ttlSeconds: 0 } })).toThrow("Invalid response-cache control");
  expect(() => headersFor({ preset: { enabled: true, ttlSeconds: 1.5 } })).toThrow("Invalid response-cache control");
});

test("reported response status is case-insensitive and missing or malformed details stay unknown", () => {
  expect(responseCacheOf({ "X-OpenRouter-Cache-Status": "MISS", "X-OpenRouter-Cache-TTL": "300" }, NO_PROVIDER_SECRETS)).toEqual({
    status: "miss",
    ageSeconds: null,
    ttlSeconds: 300,
    sourceGenerationId: null,
  });
  expect(
    responseCacheOf({ "x-openrouter-cache-status": "HIT", "x-openrouter-cache-age": "-1", "x-openrouter-cache-ttl": "60abc" }, NO_PROVIDER_SECRETS),
  ).toEqual({
    status: "hit",
    ageSeconds: null,
    ttlSeconds: null,
    sourceGenerationId: null,
  });
  expect(responseCacheOf(undefined, NO_PROVIDER_SECRETS)).toBeUndefined();
  expect(responseCacheOf({ "x-openrouter-cache-status": "BYPASS" }, NO_PROVIDER_SECRETS)).toBeUndefined();
});
