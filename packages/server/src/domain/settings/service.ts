// domain/settings — COMPOSITION ROOT. Builds the `SettingsContext` (via `createSettingsContext`, which
// owns the per-user serializer + binds the effective-config subsystem) and wires the verbs into the
// `SettingsService`. ZERO business logic — only factory calls + assembly. The effective-config read side is
// surfaced straight off the context (it was bound there at the composition surface).

import { createSettingsContext } from "./context";
import type { SettingsService, SettingsServiceDeps } from "./contract/service";
import { createAddExternalBackground } from "./verbs/add-external-background";
import { createAppSettings } from "./verbs/app-settings";
import { createCreateTheme } from "./verbs/create-theme";
import { createDuplicateTheme } from "./verbs/duplicate-theme";
import { createGetTheme } from "./verbs/get-theme";
import { createGetUserSettings } from "./verbs/get-user-settings";
import { createGlobalSettings } from "./verbs/global-settings";
import { createListThemes } from "./verbs/list-themes";
import { createLoadUserSettings } from "./verbs/load-user-settings";
import { createRemoveTheme } from "./verbs/remove-theme";
import { createUpdateTheme } from "./verbs/update-theme";
import { createUpdateUserSettingsSection } from "./verbs/update-user-settings-section";

export function createSettingsService(deps: SettingsServiceDeps): SettingsService {
  const ctx = createSettingsContext(deps);
  const globalSettings = createGlobalSettings(ctx);
  const appSettings = createAppSettings(ctx);
  return {
    getUserSettings: createGetUserSettings(ctx),
    updateUserSettingsSection: createUpdateUserSettingsSection(ctx),
    addExternalBackground: createAddExternalBackground(ctx),
    loadUserSettings: createLoadUserSettings(ctx),
    getGlobalSetting: globalSettings.getGlobalSetting,
    setGlobalSetting: globalSettings.setGlobalSetting,
    getAppSettings: appSettings.getAppSettings,
    getAppSettingsWithOverrides: appSettings.getAppSettingsWithOverrides,
    updateAppSettings: appSettings.updateAppSettings,
    getEffectiveConfig: ctx.getEffectiveConfig,
    reloadEffectiveConfig: ctx.reloadEffectiveConfig,
    listThemes: createListThemes(ctx).listThemes,
    getTheme: createGetTheme(ctx).getTheme,
    createTheme: createCreateTheme(ctx).createTheme,
    duplicateTheme: createDuplicateTheme(ctx).duplicateTheme,
    updateTheme: createUpdateTheme(ctx).updateTheme,
    removeTheme: createRemoveTheme(ctx).removeTheme,
  };
}
