// domain/settings — FRONT DOOR: the only legal external import. Re-exports the public surface:
//   • createSettingsService — the factory the entry composition root wires.
//   • the contract types client/transport consume (SettingsService methods are tRPC-inferred; the param +
//     view shapes type the inputs/outputs). SettingsServiceDeps is what entry supplies; SettingsContext is
//     the assembled DI bundle.
// AppSettings/UserSettings/EffectiveAppConfig + every settings zod schema/parser live in
// `@orb/contracts/settings` (cross-boundary) — callers import them from there directly, NOT this door.

export type {
  UpdateUserSettingsInput,
  UpdateUserSettingsSectionInput,
} from "./contract/params";
export type {
  SettingsContext,
  SettingsService,
  SettingsServiceDeps,
} from "./contract/service";
export type { GlobalSettingView, UserSettingsView } from "./contract/views";
export { createSettingsService } from "./service";
