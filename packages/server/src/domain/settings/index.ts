// domain/settings — front door: the only legal external import. AppSettings/UserSettings/EffectiveAppConfig
// and every settings zod schema/parser live in @orb/contracts/settings — callers import those directly.

export { createSettingsContext } from "./context";
export type {
  CreateThemeParams,
  DuplicateThemeParams,
  GetThemeParams,
  ListThemesParams,
  RemoveThemeParams,
  UpdateThemeParams,
  UpdateUserSettingsInput,
  UpdateUserSettingsSectionInput,
} from "./contract/params";
export type { SettingsImportOutcome, SettingsPortableFile } from "./contract/portability";
export type {
  SettingsContext,
  SettingsService,
  SettingsServiceDeps,
} from "./contract/service";
export type { GlobalSettingView, ThemeView, UserSettingsView } from "./contract/views";
export { ensureSeedThemes } from "./seed-themes";
export { createSettingsService } from "./service";
export { createExportTheme as createThemeExport } from "./verbs/export-theme";
export { createExportUserSettings as createUserSettingsExport } from "./verbs/export-user-settings";
export { createImportTheme as createThemeImport } from "./verbs/import-theme";
export { createImportUserSettings as createUserSettingsImport } from "./verbs/import-user-settings";
