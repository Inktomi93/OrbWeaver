// entry/compose/effective-config — the boot wiring for settings' resolved-config seam (tiers/entry.md
// §layout "effective-config.ts"; settings.md). settings OWNS the floor-merge (`getEffectiveConfig` SYNC
// hot-path read + `reloadEffectiveConfig` cache rebuild) on its service; this file is the THIN boot surface:
// it threads the sync getter for injection into hot-path consumers (chat/workloads, P5) and exposes the
// boot `reload` the `entry/` boot order warms the cache with (step 6 "compose"). No logic — settings
// already assembled the cache internally (the `effective-config/` subsystem); compose only surfaces it.

import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { SettingsService } from "#domain/settings";

/** The boot surface: the SYNC getter hot paths inject + the boot reload that warms the cache. */
export interface EffectiveConfigWiring {
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  readonly reload: () => Promise<EffectiveAppConfig>;
}

/** Surface settings' effective-config seam for boot warm + downstream injection. */
export function createEffectiveConfigWiring(
  settings: Pick<SettingsService, "getEffectiveConfig" | "reloadEffectiveConfig">,
): EffectiveConfigWiring {
  return {
    getEffectiveConfig: settings.getEffectiveConfig,
    reload: settings.reloadEffectiveConfig,
  };
}
