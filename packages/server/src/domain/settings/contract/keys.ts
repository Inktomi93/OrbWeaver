// domain/settings/contract/keys — the reserved global-KV key, single-homed. Homed in `contract/` (a fixed slot every internal
// slot may import) so BOTH the reserved-key guard (verbs/global-settings) and the app-row persistence can
// import it without crossing the effective-config subsystem boundary (`domain-substrate-mediates-subsystems`
// would make a runtime verb→subsystem import RED). A domain constant, not cross-boundary.

/** The reserved `settings` row that holds the AppSettings OVERRIDE blob. Its `schemaVersion` lives INSIDE
 *  the blob (the `settings` table has no version column), so the in-blob probe is authoritative for
 *  AppSettings. The generic `setGlobalSetting` REFUSES this key — `updateAppSettings` is its only writer. */
export const APP_SETTINGS_KEY = "app";
