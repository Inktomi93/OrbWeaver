// domain/settings — front door: the only legal external import. AppSettings/UserSettings/EffectiveAppConfig
// and every settings zod schema/parser live in @orb/contracts/settings — callers import those directly.

export { createSettingsAssemblyContext as createSettingsContext } from "./context.ts";
export type { LegacySeedLatches } from "./contract/composed-ops.ts";
export type { ContentSeedStep, UserContentSeeder } from "./contract/content-seed.ts";

export type { SettingsImportOutcome } from "./contract/portability.ts";

export type { DefaultBackgroundSeeder } from "./contract/seeder.ts";
export type {
  SettingsAssemblyContext as SettingsContext,
  SettingsService,
  SettingsServiceDeps,
} from "./contract/service.ts";

export { createEffectiveConfigCache } from "./effective-config/cache.ts";
// A boot verb that reads or writes rows of every owner takes `BootDatabaseHandle`, which only boot mints (D335).
export { healLegacyBackgroundPins } from "./persistence/heal-legacy-background-pins.ts";
export { createSettingsKvPort } from "./persistence/kv.ts";
export {} from "./persistence/migrate-seeded-background-picks.ts";
export { readGlobalSettings } from "./persistence/queries.ts";
export { createReadSeededKeys, recordSeededItemKeys } from "./persistence/seed-ledger.ts";
// A boot verb that reads or writes rows of every owner takes `BootDatabaseHandle`, which only boot mints (D335).
export { ensureSeedThemes } from "./seed-themes.ts";
export { createDefaultBackgroundSeeder } from "./seeder/backgrounds.ts";
export { createUserContentSeeder } from "./seeder/content.ts";
export { createSettingsService } from "./service.ts";
export { createApplyImportedAppearance } from "./verbs/apply-imported-appearance.ts";
export { createBackgroundSeedSettings, createSeedBackgroundRewriter } from "./verbs/background-seed-ops.ts";
export { createSettingsComposedOps } from "./verbs/composed-ops.ts";
export { createExportTheme } from "./verbs/export-theme.ts";
export { createExportUserSettings } from "./verbs/export-user-settings.ts";
export { createGetDatabankSettings } from "./verbs/get-databank-settings.ts";
export { createImportTheme } from "./verbs/import-theme.ts";
export { createImportUserSettings } from "./verbs/import-user-settings.ts";
export { createJoinerSettingsStatement } from "./verbs/joiner-settings-statement.ts";
export { createResolveUserProse } from "./verbs/resolve-user-prose.ts";
export { createMarkWelcomeAssistant, createPersonaSeedSettings, createReadDefaultPresetId } from "./verbs/seed-policy.ts";
export { createCachedUpstreamProbes } from "./verbs/upstream-probes.ts";
