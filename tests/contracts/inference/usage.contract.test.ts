// contracts/inference/usage — `costDetailsSchema`, the read-seam parser for `message_variants.cost_details`
// (§5.3c class 3: a PARSED sidecar, never `Record<string, unknown>` past the seam). The per-phase split is
// OPTIONAL by design: only a wire that reports one (OpenRouter's `usage.raw.cost_details.upstream_inference_*`)
// or the `estimated` arm (pricing × tokens) can state it; a required split would launder a fabricated `0` into
// a `measured` record. `foldNestedUsage` keeps its null/zero contract beside it.

import { costDetailsSchema, foldNestedUsage } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

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
