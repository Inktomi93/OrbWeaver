// domain/settings/contract/errors — the UserSettings/AppSettings surface has no custom error class by
// design: a missing user-settings row is defaults not an error, a missing global key is null. The themes
// slice needs a typed not-found: ThemeNotFoundError covers both a genuinely missing id and a fetchOwned
// miss on a seed row (seeds are un-mutable by construction, so update/remove on a seed id falls through
// here rather than a special-cased guard).

import { DomainNotFoundError } from "@orb/kit/errors";
import { STORED_CONFIG_UNREADABLE } from "#kit/stored-config";

/** The `DomainOperationError.code` discriminators settings verbs throw. */
export const SETTINGS_OP_CODES = {
  /** setGlobalSetting was handed a reserved key that must go through updateAppSettings instead. */
  reservedKey: "reserved_key",
  /** createTheme/updateTheme custom CSS failed css-validate (a containment-break shape). */
  unsafeCss: "unsafe_css",
  /** A settings write found the EXISTING stored blob unreadable and refused rather than overwrite it with
   *  the degraded default the read seam hands out (#471 — the silent whole-blob wipe class). The row is
   *  left exactly as it was; the failure reason rides the message. Thrown by `#kit/stored-config`, which
   *  is the code's ONE home — this catalog entry references it so settings' reason codes stay enumerable
   *  in one place without re-spelling the wire string. */
  storedConfigUnreadable: STORED_CONFIG_UNREADABLE,
} as const;

/** A theme the caller may read/own does not exist (or is not theirs, or is a seed on a write verb). Maps to
 *  tRPC NOT_FOUND. */
export class ThemeNotFoundError extends DomainNotFoundError {
  constructor(id: string) {
    super("theme", id);
  }
}
