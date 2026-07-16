// verbs: getGlobalSetting / setGlobalSetting — the raw global-KV pair (the `settings` table escape hatch).
// Admin-gated at the ROUTER, not here. The setter REFUSES the reserved `APP_SETTINGS_KEY`
// (it owns the dedicated `updateAppSettings` surface) — the one invariant this verb enforces. The write is
// a system-level event (no user context → `actorUserId: null`).

import { DomainOperationError } from "@orb/kit/errors";
import { SETTINGS_OP_CODES } from "../contract/errors";
import { APP_SETTINGS_KEY } from "../contract/keys";
import type { SettingsContext, SettingsService } from "../contract/service";
import { readGlobalSetting, upsertGlobalSetting } from "../persistence/queries";

interface GlobalSettingsVerbs {
  readonly getGlobalSetting: SettingsService["getGlobalSetting"];
  readonly setGlobalSetting: SettingsService["setGlobalSetting"];
}

export function createGlobalSettings(ctx: SettingsContext): GlobalSettingsVerbs {
  const getGlobalSetting: SettingsService["getGlobalSetting"] = (key) => readGlobalSetting(ctx.db, key);

  const setGlobalSetting: SettingsService["setGlobalSetting"] = async (key, value) => {
    if (key === APP_SETTINGS_KEY) {
      throw new DomainOperationError(SETTINGS_OP_CODES.reservedKey, `setGlobalSetting: '${key}' is reserved (use updateAppSettings, not the generic setter)`);
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
