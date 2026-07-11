// admin-model — the Admin pane's pure vocabulary: the create-user form shape + defaults, the role
// Select options (the delegated axis is `user ↔ admin` — the owner role is never minted/assigned from
// this surface, D17/D40: `setRole` refuses both minting a second owner and demoting the one owner), the
// password floor mirror, and the badge-intent maps. DOM-free (node-testable); presentation-only labels —
// the enforceable truth stays server-side (`domain/admin` verbs).

import type { UserRole } from "@orb/contracts/identity";
import type { BadgeProps } from "@orb/ui/badge";
import type { SelectItems } from "@orb/ui/select";

/** Mirrors `infra/auth` `MIN_PASSWORD_LENGTH` (the verb's weak_password floor) so the dialog can teach
 *  the rule before the server bounces it — the server remains the enforcement floor. */
export const ADMIN_MIN_PASSWORD_LENGTH = 8;

/** The create-user dialog's form values (the §13.4 factory shape — ≥3 fields + validation). */
export interface CreateUserFormValues {
  readonly handle: string;
  readonly password: string;
  /** The assignable axis only — `user | admin` (never `owner`; see the file header). */
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

/** vLLM engine status → badge intent. The supervisor vocab is sealed in infra (`AdminEngineStatus.status`
 *  is an open string on this side of the boundary), so this maps the KNOWN states and defaults the rest
 *  to danger — an unknown state reads as "look at this", never silently healthy. */
export function engineBadgeIntent(status: string): NonNullable<BadgeProps["intent"]> {
  if (status === "adopted" || status === "owned") {
    return "success";
  }
  if (status === "starting" || status === "stack-pending" || status === "down") {
    return "warning";
  }
  return "danger"; // hung / failed / foreign / anything new
}
