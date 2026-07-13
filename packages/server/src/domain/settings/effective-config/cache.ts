// domain/settings/effective-config/cache — in-memory resolved-config cache + reload seam. getEffectiveConfig
// is sync (hot paths must not do a per-call DB read); reloadEffectiveConfig runs at boot + after every admin
// write. The logger.level rebind is load-bearing: Pino captures level at construction, so without the rebind
// AppSettings.logLevel would be effective only at restart.
// ASSUMES(single-replica): cache is module-scope/per-process; the DB "app" row is the multi-replica seam.

import type { EffectiveAppConfig } from "@orb/contracts/settings";
import { parseAppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { logger } from "#foundation/observability";
import { readAppOverrideRaw } from "../persistence/queries";
import { layer } from "./layer";

let cache: EffectiveAppConfig | undefined;

/** The resolved runtime config (sync). Before the first reloadEffectiveConfig, this is the env-only floor. */
export function getEffectiveConfig(): EffectiveAppConfig {
  cache ??= layer({});
  return cache;
}

/** Re-read the stored override blob and rebuild the cache; rebind logger.level. Call at boot + after every
 *  admin write. */
export async function reloadEffectiveConfig(db: Db): Promise<EffectiveAppConfig> {
  const raw = await readAppOverrideRaw(db);
  const resolved = layer(parseAppSettings(raw ?? {}));
  cache = resolved;
  logger.level = resolved.logLevel;
  return resolved;
}

/** @internal test seam: drop the cache so the next read re-derives from the env floor. */
export function __resetEffectiveConfigCache(): void {
  cache = undefined;
}
