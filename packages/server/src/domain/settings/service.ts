// domain/settings — COMPOSITION ROOT. Builds the `SettingsContext` (via `createSettingsContext`, which
// owns the per-user serializer + binds the effective-config subsystem) and wires the verbs into the
// `SettingsService`. ZERO business logic — only factory calls + assembly. The effective-config read side is
// surfaced straight off the context (it was bound there at the composition surface).

import { createSettingsContext } from "./context";
import type { SettingsService, SettingsServiceDeps } from "./contract/service";
import { createAppSettings } from "./verbs/app-settings";
import { createGetUserSettings } from "./verbs/get-user-settings";
import { createGlobalSettings } from "./verbs/global-settings";
import { createLoadUserSettings } from "./verbs/load-user-settings";
import { createUpdateUserSettings } from "./verbs/update-user-settings";
import { createUpdateUserSettingsSection } from "./verbs/update-user-settings-section";

export function createSettingsService(deps: SettingsServiceDeps): SettingsService {
  const ctx = createSettingsContext(deps);
  const globalSettings = createGlobalSettings(ctx);
  const appSettings = createAppSettings(ctx);
  return {
    getUserSettings: createGetUserSettings(ctx),
    updateUserSettings: createUpdateUserSettings(ctx),
    updateUserSettingsSection: createUpdateUserSettingsSection(ctx),
    loadUserSettings: createLoadUserSettings(ctx),
    getGlobalSetting: globalSettings.getGlobalSetting,
    setGlobalSetting: globalSettings.setGlobalSetting,
    getAppSettings: appSettings.getAppSettings,
    updateAppSettings: appSettings.updateAppSettings,
    getEffectiveConfig: ctx.getEffectiveConfig,
    reloadEffectiveConfig: ctx.reloadEffectiveConfig,
  };
}
