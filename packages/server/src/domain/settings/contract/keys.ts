// domain/settings/contract/keys — the reserved global-KV key, single-homed in contract/ so both the
// reserved-key guard and the app-row persistence can import it without crossing subsystem boundaries.

/** schemaVersion lives inside this blob (the settings table has no version column). setGlobalSetting refuses this key. */
export const APP_SETTINGS_KEY = "app";
