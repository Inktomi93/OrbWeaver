// domain/settings/effective-config/cache — in-memory resolved-config cache + reload seam. getEffectiveConfig
// is sync (hot paths must not do a per-call DB read); reloadEffectiveConfig runs at boot + after every admin
// write. The logger.level rebind is load-bearing: Pino captures level at construction, so without the rebind
// AppSettings.logLevel would be effective only at restart.
// Each composed graph owns its cache; the DB "app" row is the multi-replica seam.

import type { AuthMode } from "@orb/contracts/identity";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import { parseAppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { env } from "#foundation/env";
import { logger } from "#foundation/observability";
import type { SettingsContext } from "../contract/service.ts";
import { readAppOverrideRaw } from "../persistence/queries.ts";
import { layer } from "./layer.ts";

let cache: EffectiveAppConfig | undefined;

export function createEffectiveConfigCache(db: Db, authMode: AuthMode = env.AUTH_MODE): Pick<SettingsContext, "getEffectiveConfig" | "reloadEffectiveConfig"> {
  let resolved: EffectiveAppConfig | undefined;
  return {
    getEffectiveConfig: (): EffectiveAppConfig => {
      resolved ??= layer({}, authMode);
      return resolved;
    },
    reloadEffectiveConfig: async (): Promise<EffectiveAppConfig> => {
      resolved = await readResolvedConfig(db, authMode);
      return resolved;
    },
  };
}

/** The resolved runtime config (sync). Before the first reloadEffectiveConfig, this is the env-only floor. */
export function getEffectiveConfig(): EffectiveAppConfig {
  cache ??= layer({});
  return cache;
}

/** Re-read the stored override blob and rebuild the cache; rebind logger.level. Call at boot + after every
 *  admin write. */
export async function reloadEffectiveConfig(db: Db): Promise<EffectiveAppConfig> {
  cache = await readResolvedConfig(db, env.AUTH_MODE);
  return cache;
}

async function readResolvedConfig(db: Db, authMode: AuthMode): Promise<EffectiveAppConfig> {
  const raw = await readAppOverrideRaw(db);
  const resolved = layer(parseAppSettings(raw ?? {}), authMode);
  logger.level = resolved.logLevel;
  return resolved;
}

/** @internal test seam: drop the cache so the next read re-derives from the env floor. */
export function __resetEffectiveConfigCache(): void {
  cache = undefined;
}
