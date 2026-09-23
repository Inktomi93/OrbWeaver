// THE ONE NARROWING SEAM between a vendor SDK's per-provider metadata bag and the closed sidecar the record
// stores (`VariantProviderMetadata`, §5.3c class 3 — "a parsed JSON sidecar with a zod schema at the read seam
// AND a producer-side parse on write"). This file is the producer-side half: every backend that finishes a
// `ChatResult` narrows here, so the SDK's `Record<string, unknown>` never crosses the package boundary and a
// reader downstream (the OpenRouter cost pill) names a typed field or does not compile.
//
// ADMISSION RULE, restated from the union's own header because it is what keeps this from growing back into
// the bag: an arm carries ONLY what the normalized core cannot. Cache read/write totals, the `gen-…` handle
// and the turn cost are `message_variants` COLUMNS — putting them here too would be two homes for one number.
//
// WHAT EACH VENDOR SPELLS (source-pinned against the installed SDKs, 2026-09-20):
//   • openrouter → `providerMetadata.openrouter = { provider, reasoning_details?, usage: OpenRouterUsageAccounting }`
//     (`@openrouter/ai-sdk-provider/dist/index.d.ts:457,575`). Its `provider` is the UPSTREAM vendor name, which
//     collides by spelling with our discriminator — hence the explicit field-by-field build below, never a spread.
//   • anthropic  → `providerMetadata.anthropic = { usage: <RAW snake_cased usage>, stopSequence, … }`
//     (`@ai-sdk/anthropic/dist/index.d.ts:46`, built at `index.js:5857`). `usage` is a LOOSE object, so the
//     ephemeral TTL split rides through untyped and is read here by its wire spelling.
//   • claude-sub → no SDK bag at all: the agent-sdk runner accumulates typed frames, so that arm is built from
//     a typed input and needs no parse (`agentSdkVariantMetadata`).
//   • a PLUGIN provider → an unenumerable id and an unknown payload, so its arm is PARSED through the
//     contract's own schema rather than constructed, and there is no reader by key.
// A provider that is none of these contributes NO sidecar — absence, never an empty arm, so "has provenance"
// stays a real question about the row.

import type { VariantProviderMetadata } from "@orb/contracts/chat";
import { variantProviderMetadataSchema } from "@orb/contracts/chat";
import { isPluginProviderId } from "@orb/contracts/inference";
import { z } from "zod";

/** The registry ids with a first-party arm. Bound to the union by the returns below: misspell one and the
 *  constructed object stops matching `VariantProviderMetadata`, so `tsc` refuses a switch key that can never
 *  fire — the failure mode a bare string case would have shipped silently. */
const OPENROUTER = "openrouter";
const ANTHROPIC = "anthropic";
const CLAUDE_SUB = "claude-sub";

/** OpenRouter's bag, narrowed to the two facts no column holds. `nullish` throughout: the SDK omits the whole
 *  `usage` block on an endpoint with accounting off. */
const openRouterBagSchema = z.object({
  provider: z.string().nullish(),
  usage: z.object({ costDetails: z.object({ upstreamInferenceCost: z.number().nullish() }).nullish() }).nullish(),
});

/** Anthropic's bag. The keys are the WIRE's own (`usage` is passed through raw and loose), which is why they
 *  are snake_cased here and nowhere else in this package. */
const anthropicBagSchema = z.object({
  usage: z
    .object({
      cache_creation: z.object({ ephemeral_5m_input_tokens: z.number().nullish(), ephemeral_1h_input_tokens: z.number().nullish() }).nullish(),
    })
    .nullish(),
});

/** The typed facts the agent-sdk runner accumulates for the `claude-sub` arm. An interface rather than a bag
 *  because this producer has no SDK object to parse — the frames were already read field by field. */
export interface AgentSdkTurnFacts {
  readonly cacheCreation5mTokens: number | null;
  readonly cacheCreation1hTokens: number | null;
  readonly webSearchRequests: number;
  readonly warmSpareClaimed: boolean | null;
  readonly sdkSessionId: string | null;
  readonly servedModel: string | null;
  readonly durationApiMs: number | null;
  readonly numTurns: number;
  readonly outputCapReached: boolean;
}

/** A recorded value survives, `null`/absence yields NO key. A measured zero is a real sample and is kept;
 *  absence never becomes a fabricated 0 (the `ChatUsage` posture, same reason). */
function has<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function openRouterArm(bag: unknown): VariantProviderMetadata | undefined {
  const parsed = openRouterBagSchema.safeParse(bag);
  if (!parsed.success) {
    return;
  }
  const upstreamProvider = parsed.data.provider;
  const upstreamCost = parsed.data.usage?.costDetails?.upstreamInferenceCost;
  return {
    provider: OPENROUTER,
    ...(has(upstreamProvider) ? { upstreamProvider } : {}),
    ...(has(upstreamCost) ? { upstreamCost } : {}),
  };
}

function anthropicArm(bag: unknown): VariantProviderMetadata | undefined {
  const parsed = anthropicBagSchema.safeParse(bag);
  if (!parsed.success) {
    return;
  }
  const fiveMinute = parsed.data.usage?.cache_creation?.ephemeral_5m_input_tokens;
  const oneHour = parsed.data.usage?.cache_creation?.ephemeral_1h_input_tokens;
  return {
    provider: ANTHROPIC,
    ...(has(fiveMinute) ? { cacheCreation5mTokens: fiveMinute } : {}),
    ...(has(oneHour) ? { cacheCreation1hTokens: oneHour } : {}),
  };
}

/** The plugin arm is the one shape this file cannot CONSTRUCT and have `tsc` check: both halves are runtime
 *  data (an unenumerable id, an unknown payload). So it is PARSED through the contract's own schema — the
 *  producer-side parse §5.3c class 3 names — which validates the `plugin:<ns>/<id>` pattern and the payload's
 *  JSON-ness in one step and yields a value already inside the union. The caller's `isPluginProviderId` guard
 *  stays: without it a named id would parse as its own (empty) arm and record provenance about nothing. */
function pluginArm(providerId: string, bag: unknown): VariantProviderMetadata | undefined {
  const parsed = variantProviderMetadataSchema.safeParse({ provider: providerId, raw: bag });
  return parsed.success ? parsed.data : undefined;
}

/**
 * The SDK bag under ONE provider's key → the variant's sidecar arm. `bag` is whatever the vendor put at
 * `providerMetadata[<its own key>]`; anything this file does not model yields `undefined` rather than a
 * half-filled arm.
 */
export function variantProviderMetadataOf(providerId: string, bag: unknown): VariantProviderMetadata | undefined {
  if (!has(bag)) {
    return;
  }
  switch (providerId) {
    case OPENROUTER:
      return openRouterArm(bag);
    case ANTHROPIC:
      return anthropicArm(bag);
    default:
      return isPluginProviderId(providerId) ? pluginArm(providerId, bag) : undefined;
  }
}

/**
 * The agent-sdk turn's sidecar arm. Guarded by the provider id rather than by the wire: a plugin row may
 * declare the agent-sdk wire, and its payload is `raw` with no reader by key — never the `claude-sub` shape,
 * which names a subscription's own receipts.
 */
export function agentSdkVariantMetadata(providerId: string, facts: AgentSdkTurnFacts): VariantProviderMetadata | undefined {
  if (providerId !== CLAUDE_SUB) {
    return variantProviderMetadataOf(providerId, { ...facts });
  }
  return {
    provider: CLAUDE_SUB,
    ...(has(facts.cacheCreation5mTokens) ? { cacheCreation5mTokens: facts.cacheCreation5mTokens } : {}),
    ...(has(facts.cacheCreation1hTokens) ? { cacheCreation1hTokens: facts.cacheCreation1hTokens } : {}),
    ...(facts.webSearchRequests > 0 ? { webSearchRequests: facts.webSearchRequests } : {}),
    ...(has(facts.warmSpareClaimed) ? { warmSpareClaimed: facts.warmSpareClaimed } : {}),
    ...(has(facts.durationApiMs) ? { durationApiMs: facts.durationApiMs } : {}),
    ...(facts.numTurns > 0 ? { numTurns: facts.numTurns } : {}),
    ...(facts.outputCapReached ? { outputCapReached: true } : {}),
    ...(has(facts.sdkSessionId) ? { sdkSessionId: facts.sdkSessionId } : {}),
    ...(has(facts.servedModel) ? { servedModel: facts.servedModel } : {}),
  };
}
