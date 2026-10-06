// contracts/inference/usage — `costDetailsSchema`, the read-seam parser for `message_variants.cost_details`
// (§5.3c class 3: a PARSED sidecar, never `Record<string, unknown>` past the seam). The per-phase split is
// OPTIONAL by design: only a wire that reports one (OpenRouter's `usage.raw.cost_details.upstream_inference_*`)
// or the `estimated` arm (pricing × tokens) can state it; a required split would launder a fabricated `0` into
// a `measured` record. `foldNestedUsage` keeps its null/zero contract beside it.

import type { TokenProvenance } from "@orb/contracts/chat";
import type { GenerationUsageLeg, Wire } from "@orb/contracts/inference";
import {
  costDetailsSchema,
  foldNestedUsage,
  generationUsageDetailsSchema,
  generationUsageLegSchema,
  projectGenerationUsage,
  providerDefSchema,
  responseCacheSchema,
} from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makeGenerationUsage } from "../../support/factories/generation-usage.ts";
import { expect, test } from "../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../support/inference-identities.ts";

function observedLegOf(wire: Wire, costUsd: number | null, costProvenance: TokenProvenance): GenerationUsageLeg {
  return generationUsageLegSchema.parse({
    ...makeGenerationUsage(costUsd, { tokensIn: 10, tokensOut: 20, costProvenance, ...(wire === "agent-sdk" ? { costDetails: null } : {}) }),
    model: testModelId("model"),
    provider: testProviderId(wire === "agent-sdk" ? "claude-sub" : "google"),
    wire,
    observedAt: 0,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "stop",
    stopReason: "STOP",
    terminalReason: null,
    generationId: null,
  });
}

test.each([
  {
    name: "subscription plus reported API",
    firstWire: "agent-sdk",
    secondWire: "google-generative-ai",
    firstSource: "estimated",
    secondSource: "measured",
    secondCost: 0.25,
    total: null,
    subtotal: null,
    source: "unrecorded",
  },
  {
    name: "subscription plus API estimate without a pricing snapshot",
    firstWire: "agent-sdk",
    secondWire: "google-generative-ai",
    firstSource: "estimated",
    secondSource: "estimated",
    secondCost: 0.25,
    total: null,
    subtotal: null,
    source: "unrecorded",
  },
  {
    name: "homogeneous subscription estimates",
    firstWire: "agent-sdk",
    secondWire: "agent-sdk",
    firstSource: "estimated",
    secondSource: "estimated",
    secondCost: 0.25,
    total: 0.375,
    subtotal: 0.375,
    source: "estimated",
  },
  {
    name: "reported API plus API estimate",
    firstWire: "google-generative-ai",
    secondWire: "google-generative-ai",
    firstSource: "measured",
    secondSource: "estimated",
    secondCost: 0.25,
    total: 0.375,
    subtotal: 0.375,
    source: "estimated",
  },
  {
    name: "subscription plus unknown API fee",
    firstWire: "agent-sdk",
    secondWire: "google-generative-ai",
    firstSource: "estimated",
    secondSource: "unrecorded",
    secondCost: null,
    total: null,
    subtotal: null,
    source: "unrecorded",
  },
  {
    name: "known API fee plus unknown same-basis fee",
    firstWire: "google-generative-ai",
    secondWire: "google-generative-ai",
    firstSource: "measured",
    secondSource: "unrecorded",
    secondCost: null,
    total: null,
    subtotal: 0.125,
    source: "unrecorded",
  },
] as const)("observed cost projection: $name", (fixture) => {
  const legs = [observedLegOf(fixture.firstWire, 0.125, fixture.firstSource), observedLegOf(fixture.secondWire, fixture.secondCost, fixture.secondSource)];
  const before = JSON.stringify(legs);
  const projected = projectGenerationUsage(legs);
  expect(projected.total.costUsd).toBe(fixture.total);
  expect(projected.knownSubtotal.costUsd).toBe(fixture.subtotal);
  expect(projected.total.costProvenance).toBe(fixture.source);
  expect(projected.knownSubtotal.costDetails?.totalUsd ?? null).toBe(fixture.subtotal);
  const knownSource = fixture.secondCost === null ? fixture.firstSource : fixture.source;
  expect(projected.knownSubtotal.costProvenance).toBe(fixture.subtotal === null ? "unrecorded" : knownSource);
  expect(projected.total.tokensIn).toBe(20);
  expect(projected.total.tokensOut).toBe(40);
  expect(JSON.stringify(legs)).toBe(before);
});

test("incomplete paid totals retain known zero and paid subtotals without manufacturing complete counts or rates", () => {
  const first = makeGenerationUsage(0, {
    tokensIn: 70,
    tokensOut: 0,
    reasoningTokens: 0,
    servedModel: "served-first",
    tokenDetails: { input: [{ modality: "file", tokens: 60 }] },
  });
  const second = makeGenerationUsage(null, {
    tokensIn: 20,
    tokensOut: null,
    reasoningTokens: null,
    servedModel: "served-second",
    tokenDetails: { input: [{ modality: "text", tokens: 20 }] },
  });
  const projected = projectGenerationUsage([first, second]);
  expect(projected.total).toMatchObject({
    tokensIn: 90,
    tokensOut: null,
    reasoningTokens: null,
    costUsd: null,
    costProvenance: "unrecorded",
    servedModel: null,
  });
  expect(projected.knownSubtotal).toMatchObject({ tokensIn: 90, tokensOut: 0, reasoningTokens: 0, costUsd: 0, servedModel: null });
  expect(projected.total.tokenDetails).toEqual({
    input: [
      { modality: "text", tokens: 20 },
      { modality: "file", tokens: 60 },
    ],
  });
});

test("a wireless legacy row cannot erase known incompatible observed bases, while all-wireless legacy costs retain their sum", () => {
  const subscription = observedLegOf("agent-sdk", 0.125, "estimated");
  const api = observedLegOf("google-generative-ai", 0.25, "measured");
  const legacy = makeGenerationUsage(0.5);
  const mixed = projectGenerationUsage([subscription, api, legacy]);
  expect(mixed.total.costUsd).toBeNull();
  expect(mixed.knownSubtotal.costUsd).toBeNull();
  expect(mixed.total.costDetails).toBeNull();
  expect(mixed.knownSubtotal.costDetails).toBeNull();
  expect(projectGenerationUsage([makeGenerationUsage(0.125), makeGenerationUsage(0.25)]).total.costUsd).toBe(0.375);
});

test("a response-cache fact survives its one observed leg, never masquerades as a multileg cache result", () => {
  const responseCache = responseCacheSchema.parse({ status: "hit", ageSeconds: 0, ttlSeconds: null, sourceGenerationId: "source-fixture" });
  const leg = generationUsageLegSchema.parse({
    ...makeGenerationUsage(0, { responseCache }),
    model: testModelId("served-model"),
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    observedAt: 0,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "stop",
    stopReason: "STOP",
    terminalReason: null,
    generationId: null,
  });
  expect(generationUsageLegSchema.parse(JSON.parse(JSON.stringify(leg)))).toEqual(leg);
  expect(projectGenerationUsage([leg]).total.responseCache).toEqual(responseCache);
  expect(projectGenerationUsage([leg, { ...leg, responseCache: { ...responseCache, status: "miss" } }]).total.responseCache).toBeUndefined();
});

test("the real provider parser remains available through the public module and rejects malformed leg provider identity", () => {
  expect(
    providerDefSchema.safeParse({
      id: "google",
      label: "Google",
      wire: "google-generative-ai",
      auth: "apiKey",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apis: ["google-generative-ai"],
      catalog: "url",
      metered: true,
    }).success,
  ).toBe(true);
  const leg = {
    ...makeGenerationUsage(null),
    model: testModelId("model"),
    provider: "not/a-provider",
    wire: "google-generative-ai",
    observedAt: 0,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: null,
    stopReason: null,
    terminalReason: null,
    generationId: null,
  };
  expect(generationUsageLegSchema.safeParse(leg).success).toBe(false);
});

test("costDetailsSchema: totalUsd is required; the phase split and the BYOK pair are optional", () => {
  expect(costDetailsSchema.parse({ totalUsd: 0.18 })).toEqual({ totalUsd: 0.18 });
  expect(costDetailsSchema.parse({ totalUsd: 0.18, promptUsd: 0.08, completionUsd: 0.1 })).toEqual({
    totalUsd: 0.18,
    promptUsd: 0.08,
    completionUsd: 0.1,
  });
  expect(costDetailsSchema.parse({ totalUsd: 0.2, upstreamUsd: 0.18, gatewayUsd: 0.02 })).toMatchObject({ upstreamUsd: 0.18, gatewayUsd: 0.02 });
});

test("costDetailsSchema refuses a missing total, a non-number phase, and a negative figure (a malformed blob degrades at the read seam)", () => {
  expect(costDetailsSchema.safeParse({ promptUsd: 1 }).success).toBe(false);
  expect(costDetailsSchema.safeParse({ totalUsd: "0.1" }).success).toBe(false);
  expect(costDetailsSchema.safeParse({ totalUsd: -1 }).success).toBe(false);
  expect(costDetailsSchema.safeParse(null).success).toBe(false);
});

test("foldNestedUsage: totals stay null when unreported, cache counters default to 0, reasoning rides through", () => {
  const fill = { model: castId<ModelId>("m"), contextWindow: 200_000, maxOutputTokens: 4096 };
  expect(foldNestedUsage(undefined, fill)).toMatchObject({ tokensIn: null, tokensOut: null, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: null });
  expect(foldNestedUsage({ inputTokens: { total: 18, cacheRead: 4 }, outputTokens: { total: 40, reasoning: 20 } }, fill)).toMatchObject({
    tokensIn: 18,
    tokensOut: 40,
    cacheReadTokens: 4,
    cacheWriteTokens: 0,
    reasoningTokens: 20,
  });
});

test("estimated cost retains the applied configured cache rates, without requiring them on legacy records", () => {
  const pricing = { inputPerMTok: 0.75, outputPerMTok: 3.75, cacheReadPerMTok: 0.075, cacheWritePerMTok: 0 };
  const value = { totalUsd: 0.001, pricing };
  expect(costDetailsSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  expect(costDetailsSchema.parse({ totalUsd: 0 })).toEqual({ totalUsd: 0 });
  expect(costDetailsSchema.safeParse({ totalUsd: 0, pricing: { ...pricing, cacheReadPerMTok: -1 } }).success).toBe(false);
});

test("legacy image usage preserves unavailable cache subsets and unknown cost source", () => {
  const value = {
    tokensIn: null,
    tokensOut: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    servedModel: null,
    tokenDetails: null,
    costDetails: null,
    costProvenance: null,
  };
  expect(generationUsageDetailsSchema.parse(value)).toEqual(value);
});
