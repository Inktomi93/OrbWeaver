import type { SettingsContext, SettingsService } from "#domain/settings";
import type { DebugRoutesOptions } from "#foundation/observability";

/** The boot surface: the SYNC getter hot paths inject + the boot reload that warms the cache. */
export interface EffectiveConfigWiring {
  readonly getEffectiveConfig: NonNullable<DebugRoutesOptions["effectiveConfig"]>;
  readonly reload: SettingsContext["reloadEffectiveConfig"];
}

/** Surface settings' effective-config seam for boot warm + downstream injection. */
export function createEffectiveConfigWiring(settings: Pick<SettingsService, "getEffectiveConfig" | "reloadEffectiveConfig">): EffectiveConfigWiring {
  return {
    getEffectiveConfig: settings.getEffectiveConfig,
    reload: settings.reloadEffectiveConfig,
  };
}
