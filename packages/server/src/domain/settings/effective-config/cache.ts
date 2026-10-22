// domain/settings/effective-config/cache — in-memory resolved-config cache + reload seam. getEffectiveConfig
// is sync (hot paths must not do a per-call DB read); reloadEffectiveConfig runs at boot + after every admin
// write. The logger.level rebind is load-bearing: Pino captures level at construction, so without the rebind
// AppSettings.logLevel would be effective only at restart.
// Each composed graph owns its cache; the DB "app" row is the multi-replica seam.

import type { AuthMode } from "@orb/contracts/identity";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import { parseAppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { env } from "#foundation/env";
import { logger } from "#foundation/observability";
import type { SettingsContext } from "../contract/service.ts";
import { readAppOverrideRaw } from "../persistence/queries.ts";
import { layer } from "./layer.ts";

export function createEffectiveConfigCache(
  handle: DatabaseHandle,
  authMode: AuthMode = env.AUTH_MODE,
): Pick<SettingsContext, "getEffectiveConfig" | "reloadEffectiveConfig"> {
  const db = databaseForOwner(handle);
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

async function readResolvedConfig(db: Db, authMode: AuthMode): Promise<EffectiveAppConfig> {
  const raw = await readAppOverrideRaw(db);
  const resolved = layer(parseAppSettings(raw ?? {}), authMode);
  logger.level = resolved.logLevel;
  return resolved;
}
