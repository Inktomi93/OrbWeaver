import type { UserRole } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import type { StatusVocabulary } from "./status-chip.tsx";

/** The account role chip, shared by the admin rows and the switcher's account foot. */
export const USER_ROLE_STATUS: StatusVocabulary<UserRole> = {
  owner: { label: "Owner", tone: "primary" },
  admin: { label: "Admin", tone: "info" },
  user: { label: "User", tone: "neutral" },
};

/** Whether the role chip says something the handle does not: a handle that spells the role already names it. */
export function roleChipAddsToHandle(role: UserRole, handle: Handle | null): boolean {
  return role !== handle;
}
