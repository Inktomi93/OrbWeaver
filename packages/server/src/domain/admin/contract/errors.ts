// domain/admin/contract/errors — NO custom error class (by design; admin.md §Esoteric). admin throws kit
// primitives: `DomainNotFoundError`, `DomainConflictError`, `DomainForbiddenError` (from the guard), and
// `DomainOperationError` discriminated by a `code`. This file is the ONE home for those reason codes —
// the magic-string discriminator the verbs throw and the transport maps (no inline re-spell, §7.5).

/** The `DomainOperationError.code` discriminators admin verbs throw. One home for the reason strings. */
export const ADMIN_OP_CODES = {
  /** The immutable owner row may never be demoted/disabled/removed (D17 owner-immutability guard). */
  cannotModifyOwner: "cannot_modify_owner",
  /** An actor may not disable their own account (locks the deployment out of itself). */
  cannotDisableSelf: "cannot_disable_self",
  /** `createUser` handle already taken (the `SELECT` path AND the TOCTOU `INSERT`-conflict path). */
  userExists: "user_exists",
  /** `createUser` handle failed validation (empty / malformed). */
  invalidHandle: "invalid_handle",
  /** A password below the hashing floor was supplied to `createUser` / `resetPassword`. */
  weakPassword: "weak_password",
  /** `setRole` target is the owner role, or a grant/revoke that would touch the owner (owner is fixed). */
  cannotGrantOwner: "cannot_grant_owner",
  /** A vLLM engine restart failed (the supervisor surfaced an error). */
  restartEngine: "restart_engine",
} as const;

/** The reason-code union (derived from the one tuple of values — never re-spelled). */
export type AdminOpCode = (typeof ADMIN_OP_CODES)[keyof typeof ADMIN_OP_CODES];
