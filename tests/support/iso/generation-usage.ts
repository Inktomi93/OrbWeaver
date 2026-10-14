import type { GenerationUsage } from "@orb/contracts/inference";
import { foldTokenUsage, generationUsageSchema } from "@orb/contracts/inference";

/** Known cost without a claimed token measurement; count defaults come from the real normalized fold. */
export function makeGenerationUsage(costUsd: number | null, overrides: Partial<GenerationUsage> = {}): GenerationUsage {
  return generationUsageSchema.parse({
    ...foldTokenUsage(undefined),
    servedModel: null,
    tokenDetails: null,
    costUsd,
    costDetails: costUsd === null ? null : { totalUsd: costUsd },
    costProvenance: costUsd === null ? "unrecorded" : "measured",
    ...overrides,
  });
}
