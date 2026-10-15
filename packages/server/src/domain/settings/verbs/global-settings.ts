// Admin-gated raw KV. App configuration and registered tenant namespaces use their owning write ports.

import { SETTINGS_TENANT_PREFIXES } from "@orb/contracts/settings";
import { DomainOperationError } from "@orb/kit/errors";
import { SETTINGS_OP_CODES } from "../contract/errors.ts";
import { APP_SETTINGS_KEY } from "../contract/keys.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import { readGlobalSetting, upsertGlobalSetting } from "../persistence/queries.ts";

interface GlobalSettingsVerbs {
  readonly getGlobalSetting: SettingsService["getGlobalSetting"];
  readonly setGlobalSetting: SettingsService["setGlobalSetting"];
}

export function createGlobalSettings(ctx: SettingsContext): GlobalSettingsVerbs {
  const getGlobalSetting: SettingsService["getGlobalSetting"] = (key) => readGlobalSetting(ctx.db, key);

  const setGlobalSetting: SettingsService["setGlobalSetting"] = async (key, value) => {
    if (key === APP_SETTINGS_KEY || SETTINGS_TENANT_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      throw new DomainOperationError(SETTINGS_OP_CODES.reservedKey, `setGlobalSetting: '${key}' is reserved (use its owning settings port)`);
    }
    const at = ctx.now();
    const view = await upsertGlobalSetting(ctx.db, key, value, at);
    await ctx.audit(
      {
        actorUserId: null,
        action: "settings.setGlobalSetting",
        entityType: "settings",
        entityId: key,
        metadata: { value },
      },
      at,
    );
    return view;
  };

  return { getGlobalSetting, setGlobalSetting };
}
