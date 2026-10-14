import type { RpgGameConfig, RpgGameFeatures } from "@orb/contracts/rpg";
import { rpgGameConfigSchema, rpgGameFeaturesSchema } from "@orb/contracts/rpg";

/** Builds the reusable config output component using its complete production defaults. */
export function makeRpgGameConfig(overrides: Partial<RpgGameConfig> = {}): RpgGameConfig {
  return rpgGameConfigSchema.parse(overrides);
}

/** Builds the reusable feature output component without copying its defaults or vocabulary. */
export function makeRpgGameFeatures(overrides: Partial<RpgGameFeatures> = {}): RpgGameFeatures {
  return rpgGameFeaturesSchema.parse(overrides);
}
