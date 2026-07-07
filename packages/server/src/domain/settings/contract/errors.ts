// domain/settings/contract/errors — the UserSettings/AppSettings surface has NO custom error class (by
// design): the only failures are `DomainOperationError(reserved_key)` (the generic KV setter refusing a
// reserved key) and the INJECTED `requireAdmin`/`requireOwner` throw (`DomainForbiddenError`, owned by the
// guard). A missing user-settings row is DEFAULTS not an error; a missing global key is `null`.
//
// The themes-slice (themes-design.md §4) DOES need a typed not-found: `ThemeNotFoundError` covers both a
// genuinely missing id AND a `fetchOwned` miss on a seed row (§2.1 — seeds are un-mutable BY CONSTRUCTION,
// so `updateTheme`/`removeTheme` on a seed id naturally falls through to this, never a special-cased
// "cannot edit a seed" guard). A duplicate NAME on `createTheme` is a `DomainConflictError`
// (`@orb/kit/errors`) thrown directly at the write seam (the `tag.create` TOCTOU-safe pattern) — no
// custom subclass needed. This file is the ONE home for the reason-code discriminator (no inline
// re-spell, §7.5).

import { DomainNotFoundError } from "@orb/kit/errors";

/** The `DomainOperationError.code` discriminators settings verbs throw. */
export const SETTINGS_OP_CODES = {
  /** The generic `setGlobalSetting` was handed a RESERVED key (`APP_SETTINGS_KEY`) — it owns a dedicated
   *  surface (`updateAppSettings`) and may never be written through the generic setter. */
  reservedKey: "reserved_key",
  /** `createTheme`/`updateTheme` custom CSS failed `@orb/kit/css-validate` (a containment-break shape —
   *  `position: fixed`/`sticky` — never a warning-only finding). */
  unsafeCss: "unsafe_css",
} as const;

export type SettingsOpCode = (typeof SETTINGS_OP_CODES)[keyof typeof SETTINGS_OP_CODES];

/** A theme the caller may read/own does not exist (or is not theirs, or IS a seed on a write verb — a
 *  NULL owner never matches `fetchOwned`'s predicate). Maps to tRPC NOT_FOUND. */
export class ThemeNotFoundError extends DomainNotFoundError {
  constructor(id: string) {
    super("theme", id);
  }
}
