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
  /** B5 — the row is already bound to a DIFFERENT stable SSO subject; bind-once refuses a rebind. */
  ssoRowBound: "sso_row_bound",
  /** B5 — the requested stable subject is already linked to another account (duplicate binding refused). */
  ssoSubjectTaken: "sso_subject_taken",
} as const;
