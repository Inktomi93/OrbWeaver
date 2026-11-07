// admin-model — the Admin pane's pure vocabulary: the create-user form shape + defaults, the role Select
// options (never `owner` — the setRole verb refuses minting a second owner) and the badge-tone maps. DOM-free; presentation-only labels, the enforceable truth stays server-side.

import type { UserRole } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import type { SelectItems } from "@orb/ui/select/items";
import type { StatusVocabulary } from "#components";

/** The props of an admin dialog that acts on one account (link SSO, reset password, sessions). */
export interface AdminUserDialogProps {
  readonly userId: UserId;
  readonly handle: Handle;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export interface CreateUserFormValues {
  /** The new user handle DRAFT — `""` until typed; the submit seam brands the trimmed value. */
  readonly handle: Handle | "";
  readonly password: string;
  /** The assignable axis only — `user | admin` (never `owner`). */
  readonly role: string;
}

export const CREATE_USER_DEFAULTS: CreateUserFormValues = {
  handle: "",
  password: "",
  role: "user",
};

/** The assignable roles (create dialog + per-row role select). `owner` is deliberately absent. */
export const ROLE_ITEMS: SelectItems = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

/** The per-row role chip. */
export const ROLE_STATUS: StatusVocabulary<UserRole> = {
  owner: { label: "Owner", tone: "primary" },
  admin: { label: "Admin", tone: "info" },
  user: { label: "User", tone: "neutral" },
};

// The Admin pane's ACCESSIBLE-NAME builders. Every per-row control here repeats the row's handle (or the
// handle) because the pane renders N otherwise-identical controls, and an unqualified name would hand a
// reader N identical subjects. They are exported — and the specs IMPORT them rather than re-spelling the
// literal — so a copy change is a compile error rather than a locator that silently stops matching (#2261).

/** One user row's ⋯ trigger. `kes actions` — the pane's own grammar, not the library `Actions for <x>`. */
export function userActionsName(handle: Handle): string {
  return `${handle} actions`;
}

/** One user row's role Select. `Role — kes`. */
export function userRoleFieldName(handle: Handle): string {
  return `Role — ${handle}`;
}

/** One user row's enabled Switch. `Enabled — kes`. */
export function userEnabledFieldName(handle: Handle): string {
  return `Enabled — ${handle}`;
}

/** One row in the sessions dialog. The subject is the session's user agent, falling back to its id. */
export function revokeSessionName(subject: string): string {
  return `Revoke session — ${subject}`;
}
