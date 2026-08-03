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

/** vLLM engine status → badge intent. Unknown states default to danger — never silently healthy. */
export function engineBadgeIntent(status: string): NonNullable<BadgeProps["intent"]> {
  if (status === "adopted" || status === "owned") {
    return "success";
  }
  // sleeping / sleeping-held are healthy-but-idle (weights on CPU, scheduler paused) — NOT an error;
  // an on-demand request wakes them. Distinct from the warming/warning states.
  if (status === "sleeping" || status === "sleeping-held") {
    return "info";
  }
  if (status === "starting" || status === "stack-pending" || status === "down") {
    return "warning";
  }
  return "danger"; // hung / failed / foreign / anything new
}
