import type { EndpointFeatures } from "@orb/contracts/inference";
import type { FactLeaf, FactRow } from "./connection-fact-types.ts";

/** Pricing is one required base pair with separately declared optional cache rates. */
export function pricingFactLeaves(unset: string): readonly FactLeaf[] {
  return [
    { path: "pricing.inputPerMTok", name: "price in", edit: { kind: "number" }, format: perMillionTokens },
    { path: "pricing.outputPerMTok", name: "price out", edit: { kind: "number" }, format: perMillionTokens },
    {
      path: "pricing.cacheReadPerMTok",
      name: "cache read price",
      edit: { kind: "number", min: { value: 0, reads: "0" } },
      format: perMillionTokens,
      unset,
    },
    {
      path: "pricing.cacheWritePerMTok",
      name: "cache write price",
      edit: { kind: "number", min: { value: 0, reads: "0" } },
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
