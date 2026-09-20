// backends/kit/provider-metadata — the producer-side half of §5.3c class 3: a vendor SDK's per-provider bag →
// the CLOSED `VariantProviderMetadata` the variant row stores. What is pinned here is the arm CONSTRUCTION
// (the seam-level red-first proofs live in `../v4/result.test.ts` and the engine's stats suite, where the
// assertions compile against the pre-fix source). Three defect classes drive these cases:
//   1. the DISCRIMINATOR COLLISION — OpenRouter's bag has its own `provider` key holding the UPSTREAM vendor
//      name, and a spread would have overwritten the arm's discriminator with it;
//   2. the HALF-FILLED ARM — a provider we model nothing for must yield ABSENCE, not `{ provider }`, or
//      "this row has provenance" stops being a real question;
//   3. the PLUGIN ARM's parse — its payload is unknown at compile time, so it is `jsonValueSchema` or nothing.
// Every value is parsed from the shape the installed SDK actually emits (pinned in the module's header).

import { parseVariantMetadata } from "@orb/contracts/chat";
import { agentSdkVariantMetadata, variantProviderMetadataOf } from "../../../../packages/inference/src/backends/kit/provider-metadata.ts";
import { expect, test } from "../../../support/fixtures.ts";

const AGENT_SDK_FACTS = {
  cacheCreation5mTokens: null,
  cacheCreation1hTokens: null,
  webSearchRequests: 0,
  warmSpareClaimed: null,
  sdkSessionId: null,
  servedModel: null,
  durationApiMs: null,
  numTurns: 0,
} as const;

test("openrouter: the upstream vendor and its pre-fee charge — the two facts no column holds", () => {
  const bag = { provider: "Anthropic", reasoning_details: [], usage: { cost: 0.5, costDetails: { upstreamInferenceCost: 0.4 } } };
  expect(variantProviderMetadataOf("openrouter", bag)).toEqual({ provider: "openrouter", upstreamProvider: "Anthropic", upstreamCost: 0.4 });
});

test("openrouter: the vendor's OWN `provider` key never becomes our discriminator", () => {
  // The collision is not hypothetical: OR spells the routed vendor under exactly the key the union discriminates
  // on, so a `{ ...bag }` build would have produced an arm claiming provider "DeepInfra" — which parses as the
  // PLUGIN arm's pattern the moment a vendor name ever looks like one, and as nothing at all otherwise.
  const meta = variantProviderMetadataOf("openrouter", { provider: "plugin:acme/vision", usage: { cost: 1 } });
  expect(meta).toEqual({ provider: "openrouter", upstreamProvider: "plugin:acme/vision" });
  expect(parseVariantMetadata({ providerMetadata: meta }).providerMetadata?.provider).toBe("openrouter");
});

test("openrouter: an endpoint with usage accounting off records the arm with no figures, never a fabricated 0", () => {
  expect(variantProviderMetadataOf("openrouter", { provider: "OpenAI" })).toEqual({ provider: "openrouter", upstreamProvider: "OpenAI" });
  expect(variantProviderMetadataOf("openrouter", {})).toEqual({ provider: "openrouter" });
  // A measured zero IS a sample and survives; absence is what disappears.
  expect(variantProviderMetadataOf("openrouter", { usage: { costDetails: { upstreamInferenceCost: 0 } } })).toEqual({
    provider: "openrouter",
    upstreamCost: 0,
  });
});

test("anthropic: the ephemeral TTL split off the RAW loose usage — the one fact `cache_write_tokens` cannot state", () => {
  const bag = { usage: { input_tokens: 10, cache_creation: { ephemeral_5m_input_tokens: 120, ephemeral_1h_input_tokens: 4000 } }, stopSequence: null };
  expect(variantProviderMetadataOf("anthropic", bag)).toEqual({ provider: "anthropic", cacheCreation5mTokens: 120, cacheCreation1hTokens: 4000 });
  // A turn that wrote no cache: the arm is present (the turn ran on anthropic) and states nothing.
  expect(variantProviderMetadataOf("anthropic", { usage: { input_tokens: 10 } })).toEqual({ provider: "anthropic" });
});

test("a plugin provider's payload lands under `raw`, parsed as JSON and never cast", () => {
  const meta = variantProviderMetadataOf("plugin:acme/vision", { anything: [1, { deep: true }] });
  expect(meta).toEqual({ provider: "plugin:acme/vision", raw: { anything: [1, { deep: true }] } });
  // Not JSON ⇒ nothing stored. A bigint (or any unserialisable value) must not become a row the read seam
  // then drops, nor a `JSON.stringify` throw at the write.
  expect(variantProviderMetadataOf("plugin:acme/vision", { big: 10n })).toBeUndefined();
});

test("a provider with no first-party arm, and an absent bag, both record NOTHING", () => {
  expect(variantProviderMetadataOf("vllm", { anything: true })).toBeUndefined();
  expect(variantProviderMetadataOf("custom-openai", { usage: { cost: 1 } })).toBeUndefined();
  expect(variantProviderMetadataOf("openrouter", undefined)).toBeUndefined();
  expect(variantProviderMetadataOf("anthropic", null)).toBeUndefined();
});

test("claude-sub: the subscription's own receipts, absence-preserving", () => {
  const meta = agentSdkVariantMetadata("claude-sub", {
    ...AGENT_SDK_FACTS,
    cacheCreation5mTokens: 900,
    cacheCreation1hTokens: 0,
    webSearchRequests: 2,
    warmSpareClaimed: false,
    sdkSessionId: "sess-1",
    servedModel: "claude-opus-5",
    durationApiMs: 1200,
    numTurns: 3,
  });
  expect(meta).toEqual({
    provider: "claude-sub",
    cacheCreation5mTokens: 900,
    // A recorded 0 survives — it says "1h cache was live and wrote nothing", which absence cannot say.
    cacheCreation1hTokens: 0,
    webSearchRequests: 2,
    // `false` is a RECEIPT (the spare was checked and not claimed), not an absence.
    warmSpareClaimed: false,
    sdkSessionId: "sess-1",
    servedModel: "claude-opus-5",
    durationApiMs: 1200,
    numTurns: 3,
  });
  expect(agentSdkVariantMetadata("claude-sub", AGENT_SDK_FACTS)).toEqual({ provider: "claude-sub" });
});

test("claude-sub: the arm is guarded by the PROVIDER ID — a plugin row on the agent-sdk wire gets `raw`, never a subscription's shape", () => {
  const meta = agentSdkVariantMetadata("plugin:acme/agent", { ...AGENT_SDK_FACTS, warmSpareClaimed: true, numTurns: 1 });
  expect(meta?.provider).toBe("plugin:acme/agent");
  expect(meta).toEqual({ provider: "plugin:acme/agent", raw: { ...AGENT_SDK_FACTS, warmSpareClaimed: true, numTurns: 1 } });
});

test("every arm this module builds SURVIVES the read seam — a producer the parser rejects is a silent data drop", () => {
  const arms = [
    variantProviderMetadataOf("openrouter", { provider: "Anthropic", usage: { costDetails: { upstreamInferenceCost: 0.4 } } }),
    variantProviderMetadataOf("anthropic", { usage: { cache_creation: { ephemeral_5m_input_tokens: 1, ephemeral_1h_input_tokens: 2 } } }),
    variantProviderMetadataOf("plugin:acme/vision", { seen: 1 }),
    agentSdkVariantMetadata("claude-sub", { ...AGENT_SDK_FACTS, numTurns: 2, sdkSessionId: "s" }),
  ];
  for (const arm of arms) {
    expect(parseVariantMetadata({ providerMetadata: arm }).providerMetadata, `arm ${String(arm?.provider)} must round-trip the read seam`).toEqual(arm);
  }
});
