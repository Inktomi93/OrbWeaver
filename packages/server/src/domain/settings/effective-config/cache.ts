// domain/settings/effective-config/cache — in-memory resolved-config cache + reload seam. getEffectiveConfig
// is sync (hot paths must not do a per-call DB read); reloadEffectiveConfig runs at boot + after every admin
// write. The level rebind of the root's logger is load-bearing: Pino captures level at construction, so without
// it AppSettings.logLevel would be effective only at restart.
// Each composed graph owns its cache; the DB "app" row is the multi-replica seam.

import type { EffectiveAppConfig } from "@orb/contracts/settings";
import { parseAppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { Logger } from "#foundation/observability";
import type { SettingsContext, SettingsEnvFloor } from "../contract/service.ts";
import { readAppOverrideRaw } from "../persistence/queries.ts";
import { layer } from "./layer.ts";

export function createEffectiveConfigCache(
  handle: DatabaseHandle,
  floor: SettingsEnvFloor,
  logger: Logger,
): Pick<SettingsContext, "getEffectiveConfig" | "reloadEffectiveConfig"> {
  const db = databaseForOwner(handle);
  let resolved: EffectiveAppConfig | undefined;
  return {
    getEffectiveConfig: (): EffectiveAppConfig => {
      resolved ??= layer({}, floor);
      return resolved;
    },
    reloadEffectiveConfig: async (): Promise<EffectiveAppConfig> => {
      resolved = await readResolvedConfig(db, floor);
      logger.level = resolved.logLevel;
      return resolved;
    },
  };
}

async function readResolvedConfig(db: Db, floor: SettingsEnvFloor): Promise<EffectiveAppConfig> {
  const raw = await readAppOverrideRaw(db);
  return layer(parseAppSettings(raw ?? {}), floor);
}
