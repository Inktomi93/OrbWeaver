// domain/settings — front door: the only legal external import. AppSettings/UserSettings/EffectiveAppConfig
// and every settings zod schema/parser live in @orb/contracts/settings — callers import those directly.

export { createSettingsContext } from "./context.ts";
export type { JoinerSettingsStatementOp } from "./contract/ops.ts";
export type {
  CreateThemeParams,
  DuplicateThemeParams,
  GetThemeParams,
  ListThemesParams,
  RemoveThemeParams,
  UpdateThemeParams,
  UpdateUserSettingsSectionInput,
} from "./contract/params.ts";
export type { ImportedAppearance, ImportedAppearanceOutcome, SettingsImportOutcome, SettingsPortableFile } from "./contract/portability.ts";
export type {
  DefaultBackgroundSeeder,
  DefaultBackgroundSeederDeps,
  SeedBackgroundPlateRef,
  SeededLibraryEntry,
  SeededPlateAsset,
  SeededSlugResolver,
} from "./contract/seeder.ts";
export type {
  SettingsContext,
  SettingsService,
  SettingsServiceDeps,
} from "./contract/service.ts";
export type { GlobalSettingView, ThemeView, UserSettingsView } from "./contract/views.ts";
export { healLegacyBackgroundPins } from "./persistence/heal-legacy-background-pins.ts";
export { migrateSeededBackgroundPicks } from "./persistence/migrate-seeded-background-picks.ts";
export { listSeededItemKeys, recordSeededItemKeys } from "./persistence/seed-ledger.ts";
export { ensureSeedThemes } from "./seed-themes.ts";
export { createDefaultBackgroundSeeder } from "./seeder/backgrounds.ts";
export { createSettingsService } from "./service.ts";
export { createApplyImportedAppearance } from "./verbs/apply-imported-appearance.ts";
export { createExportTheme } from "./verbs/export-theme.ts";
export { createExportUserSettings } from "./verbs/export-user-settings.ts";
export { createImportTheme } from "./verbs/import-theme.ts";
export { createImportUserSettings } from "./verbs/import-user-settings.ts";
export { createJoinerSettingsStatement } from "./verbs/joiner-settings-statement.ts";
