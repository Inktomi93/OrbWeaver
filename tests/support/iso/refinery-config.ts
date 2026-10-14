import type { RefineryStageConfig } from "@orb/contracts/refinery";
import { DEFAULT_REFINERY_STAGE_CONFIG, refineryStageConfigSchema } from "@orb/contracts/refinery";

/** Builds stage configuration from the same defaults a real refinery session is born with. */
export function makeRefineryStageConfig(overrides: { [Stage in keyof RefineryStageConfig]?: Partial<RefineryStageConfig[Stage]> } = {}): RefineryStageConfig {
  return refineryStageConfigSchema.parse({
    score: { ...DEFAULT_REFINERY_STAGE_CONFIG.score, ...overrides.score },
    rewrite: { ...DEFAULT_REFINERY_STAGE_CONFIG.rewrite, ...overrides.rewrite },
    analyze: { ...DEFAULT_REFINERY_STAGE_CONFIG.analyze, ...overrides.analyze },
  });
}
