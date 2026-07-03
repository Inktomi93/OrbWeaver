// domain/settings/contract/errors — NO custom error class (by design). The
// only failures are `DomainOperationError(reserved_key)` (the generic KV setter refusing a reserved key)
// and the INJECTED `requireAdmin`/`requireOwner` throw (`DomainForbiddenError`, owned by the guard). A
// missing user-settings row is DEFAULTS not an error; a missing global key is `null`. This file is the ONE
// home for the reason-code discriminator (no inline re-spell, §7.5).

/** The `DomainOperationError.code` discriminators settings verbs throw. One home for the reason strings. */
export const SETTINGS_OP_CODES = {
  /** The generic `setGlobalSetting` was handed a RESERVED key (`APP_SETTINGS_KEY`) — it owns a dedicated
   *  surface (`updateAppSettings`) and may never be written through the generic setter. */
  reservedKey: "reserved_key",
} as const;

/** The reason-code union (derived from the one tuple of values — never re-spelled). */
export type SettingsOpCode = (typeof SETTINGS_OP_CODES)[keyof typeof SETTINGS_OP_CODES];
