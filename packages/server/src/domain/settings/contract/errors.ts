// domain/settings/contract/errors — the UserSettings/AppSettings surface has no custom error class by
// design: a missing user-settings row is defaults not an error, a missing global key is null. The themes
// slice needs a typed not-found: ThemeNotFoundError covers both a genuinely missing id and a fetchOwned
// miss on a seed row (seeds are un-mutable by construction, so update/remove on a seed id falls through
// here rather than a special-cased guard).

import { DomainNotFoundError } from "@orb/kit/errors";

/** The `DomainOperationError.code` discriminators settings verbs throw. */
export const SETTINGS_OP_CODES = {
  /** setGlobalSetting was handed a reserved key that must go through updateAppSettings instead. */
  reservedKey: "reserved_key",
  /** createTheme/updateTheme custom CSS failed css-validate (a containment-break shape). */
  unsafeCss: "unsafe_css",
  /** A `routing.roleDefaults` patch pinned a model on a source that serves only its configured one
   *  (substrate/routing-coherence.ts) — the `{source:"vllm", model:"anthropic/…"}` pair that 404s a turn. */
  incoherentRoleModel: "incoherent_role_model",
} as const;

/** A theme the caller may read/own does not exist (or is not theirs, or is a seed on a write verb). Maps to
 *  tRPC NOT_FOUND. */
export class ThemeNotFoundError extends DomainNotFoundError {
  constructor(id: string) {
    super("theme", id);
  }
}
