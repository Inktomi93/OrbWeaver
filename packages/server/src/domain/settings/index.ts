// domain/settings — FRONT DOOR: the only legal external import. Re-exports the public surface:
//   • createSettingsService — the factory the entry composition root wires.
//   • the contract types client/transport consume (SettingsService methods are tRPC-inferred; the param +
//     view shapes type the inputs/outputs). SettingsServiceDeps is what entry supplies; SettingsContext is
//     the assembled DI bundle.
// AppSettings/UserSettings/EffectiveAppConfig + every settings zod schema/parser live in
// `@orb/contracts/settings` (cross-boundary) — callers import them from there directly, NOT this door.

// The DI-bundle builder — front-doored so the entry composition root can assemble a `SettingsContext` to feed
// the portability verb factories below (the delivery core wires them into a `PortableEntity` descriptor).
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
// Portable-entity export/import verb factories (the uniform portability template §1 parts 2/3). Owner-scoped,
// serde-backed (`#kit/serde/theme` / `#kit/serde/user-settings`), writing ONLY the settings domain's own
// `themes` / `user_settings` tables. user-settings carries the SECRETS FENCE (share-safe allowlist only). The
// entry root wires these into the registry; return shapes structurally match PortableFile / PortableImportOutcome.
export { createExportTheme as createThemeExport } from "./verbs/export-theme";
export { createExportUserSettings as createUserSettingsExport } from "./verbs/export-user-settings";
export { createImportTheme as createThemeImport } from "./verbs/import-theme";
export { createImportUserSettings as createUserSettingsImport } from "./verbs/import-user-settings";
