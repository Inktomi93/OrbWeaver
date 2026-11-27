import type { EndpointFeatures } from "@orb/contracts/inference";
import { tokenPricingSchema } from "@orb/contracts/inference";
import { numberEdit } from "./connection-fact-bounds.ts";
import type { FactLeaf, FactRow } from "./connection-fact-types.ts";

const RATES = tokenPricingSchema.shape;

/** Pricing is one required base pair with separately declared optional cache rates. */
export function pricingFactLeaves(unset: string): readonly FactLeaf[] {
  return [
    { path: "pricing.inputPerMTok", name: "price in", edit: numberEdit(RATES.inputPerMTok), format: perMillionTokens },
    { path: "pricing.outputPerMTok", name: "price out", edit: numberEdit(RATES.outputPerMTok), format: perMillionTokens },
    {
      path: "pricing.cacheReadPerMTok",
      name: "cache read price",
      edit: numberEdit(RATES.cacheReadPerMTok),
      format: perMillionTokens,
      unset,
    },
    {
      path: "pricing.cacheWritePerMTok",
      name: "cache write price",
      edit: numberEdit(RATES.cacheWritePerMTok),
      format: perMillionTokens,
      unset,
    },
  ];
}

function perMillionTokens(value: unknown): string {
  return `$${String(value)} per million tokens`;
}

/** Optional rate overrides preserve the required base pair at the declared write boundary. */
export function pricingSiblings(path: string, folded: EndpointFeatures, declared: EndpointFeatures | undefined): FactRow["siblings"] {
  const pricing = folded.pricing;
  if (pricing === undefined || declared?.pricing !== undefined || !path.startsWith("pricing.")) {
    return {};
  }
  return { "features.pricing.inputPerMTok": pricing.inputPerMTok, "features.pricing.outputPerMTok": pricing.outputPerMTok };
}
