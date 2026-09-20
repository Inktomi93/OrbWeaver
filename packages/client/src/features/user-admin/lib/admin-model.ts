// admin-model — the Admin pane's pure vocabulary: the create-user form shape + defaults, the role Select
// options (never `owner` — the setRole verb refuses minting a second owner), the password floor mirror,
// and the badge-intent maps. DOM-free; presentation-only labels, the enforceable truth stays server-side.

import type { UserRole } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import type { BadgeProps } from "@orb/ui/badge";
import type { SelectItems } from "@orb/ui/select";

/** Mirrors the server's weak_password floor so the dialog can teach the rule before the server bounces it. */
export const ADMIN_MIN_PASSWORD_LENGTH = 8;

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
export const ROLE_ITEMS: SelectItems<string> = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

/** Role → chip label (the per-row role badge copy). */
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  user: "User",
};

/** Role → badge intent (the per-row role chip). */
export const ROLE_BADGE_INTENT: Record<UserRole, NonNullable<BadgeProps["intent"]>> = {
  owner: "primary",
  admin: "info",
  user: "neutral",
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
