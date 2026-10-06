// An embedding prices input only. A flat token rate cannot price a mixed-modality request; missing
// counts or rates remain unknown, and a provider-reported charge wins over configured estimates.

import type { CostUsage, TokenPricing } from "@orb/contracts/inference";
import type { MeasuredCost } from "../v4/result.ts";

const TOKENS_PER_MTOK = 1_000_000;

export function embeddingCostOf(promptTokens: number | null, pricing: TokenPricing | undefined, measured: MeasuredCost | null, textOnly: boolean): CostUsage {
  if (measured !== null) {
    return { costUsd: measured.costUsd, costDetails: measured.costDetails, costProvenance: "measured" };
  }
  if (textOnly && promptTokens !== null && pricing !== undefined) {
    const promptUsd = (promptTokens * pricing.inputPerMTok) / TOKENS_PER_MTOK;
    return { costUsd: promptUsd, costDetails: { totalUsd: promptUsd, promptUsd, pricing }, costProvenance: "estimated" };
  }
  return { costUsd: null, costDetails: null, costProvenance: "unrecorded" };
}
