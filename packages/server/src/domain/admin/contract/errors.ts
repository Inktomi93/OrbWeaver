// domain/admin/contract/errors — no custom error class by design; admin throws kit primitives plus
// DomainOperationError discriminated by a code. This file is the one home for those reason codes.

export const ADMIN_OP_CODES = {
  cannotModifyOwner: "cannot_modify_owner",
  /** An agent principal's role/password is not human-mutable; setEnabled still works (it's the containment verb). */
  cannotModifyAgent: "cannot_modify_agent",
  cannotDisableSelf: "cannot_disable_self",
  userExists: "user_exists",
  invalidHandle: "invalid_handle",
  weakPassword: "weak_password",
  cannotGrantOwner: "cannot_grant_owner",
  restartEngine: "restart_engine",
} as const;
