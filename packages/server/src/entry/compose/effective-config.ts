import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { SettingsService } from "#domain/settings";

/** The boot surface: the SYNC getter hot paths inject + the boot reload that warms the cache. */
export interface EffectiveConfigWiring {
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  readonly reload: () => Promise<EffectiveAppConfig>;
}

/** Surface settings' effective-config seam for boot warm + downstream injection. */
export function createEffectiveConfigWiring(settings: Pick<SettingsService, "getEffectiveConfig" | "reloadEffectiveConfig">): EffectiveConfigWiring {
  return {
    getEffectiveConfig: settings.getEffectiveConfig,
    reload: settings.reloadEffectiveConfig,
  };
}
