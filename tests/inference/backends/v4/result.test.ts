// backends/v4/result — the drained V4 stream → the ONE `ChatResult` record. Under test: the cost fold with its
// PROVENANCE (§5.3c). A4 (the audit's BYOK lie): `measuredCostOf` used to read `usage.cost` alone, which on a BYOK
// OpenRouter connection is the OR FEE, not the spend. The wire hands us `is_byok` + the upstream figure + a
// per-phase split on the V4 `usage.raw` (measured 2026-09-20, `gen-1789884256-ZeulFgkGknjAbAgCKe1S`:
// `cost_details.upstream_inference_{cost,prompt_cost,completions_cost}`, `is_byok`), so the record can say
// total / gateway / upstream honestly. The BYOK arm itself is a fixture (no BYOK account on the box) shaped per
// the installed `@openrouter/ai-sdk-provider` package's own README and dist schema
// (`node_modules/@openrouter/ai-sdk-provider/{README.md,dist/index.js}`).

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ResultContext } from "../../../../packages/inference/src/backends/v4/result.ts";
import { measuredCostOf, toChatResult } from "../../../../packages/inference/src/backends/v4/result.ts";
import type { StreamDrain } from "../../../../packages/inference/src/backends/v4/stream.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** The OR provider metadata + V4 usage.raw as the dist emits them (values from the 2026-09-20 probe, scaled). */
function openRouterUsage(args: {
  readonly cost: number;
  readonly upstream: number;
  readonly prompt?: number;
  readonly completions?: number;
  readonly byok: boolean;
}): {
  readonly providerMetadata: StreamDrain["providerMetadata"];
  readonly raw: Record<string, unknown>;
} {
  return {
    providerMetadata: {
      openrouter: { usage: { promptTokens: 16, completionTokens: 4, totalTokens: 20, cost: args.cost, costDetails: { upstreamInferenceCost: args.upstream } } },
    },
    raw: {
      prompt_tokens: 16,
      completion_tokens: 4,
      total_tokens: 20,
      cost: args.cost,
      cost_details: {
        upstream_inference_cost: args.upstream,
        ...(args.prompt !== undefined ? { upstream_inference_prompt_cost: args.prompt } : {}),
        ...(args.completions !== undefined ? { upstream_inference_completions_cost: args.completions } : {}),
      },
      is_byok: args.byok,
    },
  };
}

test("A4: a non-BYOK OpenRouter turn is measured at OR's `cost` with the upstream phase split carried", () => {
  const { providerMetadata, raw } = openRouterUsage({ cost: 0.18, upstream: 0.18, prompt: 0.08, completions: 0.1, byok: false });
  expect(measuredCostOf(providerMetadata, raw)).toEqual({ costUsd: 0.18, costDetails: { totalUsd: 0.18, promptUsd: 0.08, completionUsd: 0.1 } });
});

test("A4: a BYOK turn's spend is the upstream charge PLUS OR's fee — `cost` alone is the fee, never the total", () => {
  // Dyadic figures so the sum is exact in binary (the pin is about the ARITHMETIC of the arms, not rounding).
  const { providerMetadata, raw } = openRouterUsage({ cost: 0.25, upstream: 0.5, prompt: 0.125, completions: 0.375, byok: true });
  expect(measuredCostOf(providerMetadata, raw)).toEqual({
    costUsd: 0.75,
    costDetails: { totalUsd: 0.75, promptUsd: 0.125, completionUsd: 0.375, upstreamUsd: 0.5, gatewayUsd: 0.25 },
  });
  // The BYOK bit is the discriminator — the same figures with `is_byok: false` are a passthrough at `cost`.
  const passthrough = openRouterUsage({ cost: 0.25, upstream: 0.5, byok: false });
  expect(measuredCostOf(passthrough.providerMetadata, passthrough.raw)).toEqual({ costUsd: 0.25, costDetails: { totalUsd: 0.25 } });
});

test("A4: no split reported ⇒ no phase fields (never a fabricated 0); no OR usage at all ⇒ null", () => {
  const { providerMetadata, raw } = openRouterUsage({ cost: 0.18, upstream: 0.18, byok: false });
  expect(measuredCostOf(providerMetadata, raw)).toEqual({ costUsd: 0.18, costDetails: { totalUsd: 0.18 } });
  expect(measuredCostOf({ anthropic: { usage: { input_tokens: 1 } } }, undefined)).toBeNull();
  expect(measuredCostOf(undefined, undefined)).toBeNull();
  // A raw usage without the OR metadata is not a measurement either (the metadata is the SDK's typed word).
  expect(measuredCostOf(undefined, raw)).toBeNull();
});

function drainOf(overrides: Partial<StreamDrain> = {}): StreamDrain {
  return {
    reply: "ok",
    reasoning: "",
    reasoningParts: [],
    toolCalls: [],
    images: [],
    finish: { unified: "stop", raw: "end_turn" },
    usage: { inputTokens: { total: 16, noCache: 16, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 4, text: 4, reasoning: 0 } },
    providerMetadata: undefined,
    responseId: undefined,
    warnings: [],
    ...overrides,
  };
}

function ctxOf(overrides: Partial<ResultContext> = {}): ResultContext {
  return {
    model: castId<ModelId>("m"),
    providerId: "openrouter",
    generation: makeGenerationCapability(),
    maxOutputTokens: undefined,
    startedAt: 0,
    firstDeltaAt: undefined,
    now: 10,
    measuredCost: null,
    pricing: undefined,
    generationId: null,
    appliedEffort: null,
    rateLimit: null,
    warnings: [],
    ...overrides,
  };
}

test("the fold's three provenance arms: measured carries the record; estimated derives the split from pricing; unrecorded is null", () => {
  const measured = toChatResult(drainOf(), ctxOf({ measuredCost: { costUsd: 0.18, costDetails: { totalUsd: 0.18, promptUsd: 0.08, completionUsd: 0.1 } } }));
  expect(measured.usage).toMatchObject({ costUsd: 0.18, costDetails: { totalUsd: 0.18, promptUsd: 0.08, completionUsd: 0.1 }, costProvenance: "measured" });
  // 16 in × $1/MTok + 4 out × $2/MTok — the estimated arm states the split it computed.
  const estimated = toChatResult(drainOf(), ctxOf({ pricing: { inputPerMTok: 1_000_000, outputPerMTok: 2_000_000 } }));
  expect(estimated.usage).toMatchObject({ costUsd: 24, costDetails: { totalUsd: 24, promptUsd: 16, completionUsd: 8 }, costProvenance: "estimated" });
  const unrecorded = toChatResult(drainOf(), ctxOf());
  expect(unrecorded.usage).toMatchObject({ costUsd: null, costDetails: null, costProvenance: "unrecorded" });
});

// ── §5.3c — THE SIDECAR IS NARROWED AT THE RECORD, NOT CARRIED AS A BAG ─────────────────────────────────
// RED-FIRST against the unmodified source: these assert the VALUE `ChatResult.providerMetadata` carries, never
// the new module's API, so they compile and run either way. Pre-fix the fold emitted
// `{ [ctx.providerId]: <the SDK's whole bag> }` — an open `Record<string, unknown>` no reader could name a
// field on, and which the read seam's closed union drops on the floor at the first history read.
test("§5.3c: an OpenRouter turn records the NAMED arm — the upstream vendor and its pre-fee charge", () => {
  const drain = drainOf({
    providerMetadata: { openrouter: { provider: "Anthropic", usage: { cost: 0.5, costDetails: { upstreamInferenceCost: 0.4 } } } },
  });
  expect(toChatResult(drain, ctxOf()).providerMetadata).toEqual({ provider: "openrouter", upstreamProvider: "Anthropic", upstreamCost: 0.4 });
});

test("§5.3c: the bag is read under OUR registry id alone — the old `?? openrouter` fallback filed it under the wrong provider", () => {
  // A connection whose provider is `custom-openai` pointed at an OR-compatible endpoint used to produce
  // `{ "custom-openai": <OR's bag> }`: a per-provider record asserting facts about a provider that never ran.
  // The COST still lands (`measuredCostOf` reads OR's key unconditionally — a cost is the same number whoever
  // routed it); the provenance arm is absent, which is the honest answer.
  const drain = drainOf({ providerMetadata: { openrouter: { usage: { cost: 0.2 } } } });
  expect(toChatResult(drain, ctxOf({ providerId: "custom-openai" })).providerMetadata).toBeUndefined();
});
