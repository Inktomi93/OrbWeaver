// admin-model — the Admin pane's pure vocabulary: the create-user form shape + defaults, the role Select
// options (never `owner` — the setRole verb refuses minting a second owner) and the badge-tone maps. DOM-free; presentation-only labels, the enforceable truth stays server-side.

import type { UserRole } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import type { SelectItems } from "@orb/ui/select/items";
import { DIALOG_VERBS, ITEM_ENABLED_SETTING, itemSwitchName } from "#lib";

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
  readonly role: Exclude<UserRole, "owner">;
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
  return `Role: ${handle}`;
}

/** The admin override row's Save, at rest and while its write is in flight. */
export const ADMIN_SAVE_LABEL = DIALOG_VERBS.save;
export const ADMIN_SAVING_LABEL = "Saving…";

/** An admin override row's Save names its section, as its Reset does, because several sections share one pane. */
export function adminSaveName(label: typeof ADMIN_SAVE_LABEL | typeof ADMIN_SAVING_LABEL, sectionLabel: string): string {
  return `${label}: ${sectionLabel}`;
}

/** One user row's enabled Switch: the item-switch grammar over the handle. */
export function userEnabledFieldName(handle: Handle): string {
  return itemSwitchName(ITEM_ENABLED_SETTING, handle);
}

/** One row in the sessions dialog. The subject is the session's user agent, falling back to its id. */
export function revokeSessionName(subject: string): string {
  return `Revoke session: ${subject}`;
}
