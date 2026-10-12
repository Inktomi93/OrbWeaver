import type { EffectiveAppConfig } from "@orb/contracts/settings";
import { resolveTier0Range } from "./bridge.ts";

/** Resolve tier coverage against current memory defaults, never a boot-frozen snapshot. */
export function createLiveTier0Range(getEffectiveConfig: () => EffectiveAppConfig): (tier: number, blockIdx: number) => ReturnType<typeof resolveTier0Range> {
  return (tier, blockIdx) => resolveTier0Range(getEffectiveConfig().memoryDefaults, tier, blockIdx);
}
