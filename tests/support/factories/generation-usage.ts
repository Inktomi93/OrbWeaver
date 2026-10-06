import type { GenerationUsage } from "@orb/contracts/inference";

/** A fixture with known cost but no claimed token measurement. */
export function makeGenerationUsage(costUsd: number | null, overrides: Partial<GenerationUsage> = {}): GenerationUsage {
  return {
    tokensIn: null,
    tokensOut: null,
    reasoningTokens: null,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    servedModel: null,
    tokenDetails: null,
    costUsd,
    costDetails: costUsd === null ? null : { totalUsd: costUsd },
    costProvenance: costUsd === null ? "unrecorded" : "measured",
    ...overrides,
  };
}
