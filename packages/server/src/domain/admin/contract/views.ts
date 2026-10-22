import type { AdminUserView, UserRoleState } from "@orb/contracts/identity";

/** Resolved server data is not the wire role string. */
export interface AdminUserData extends Omit<AdminUserView, "role"> {
  readonly role: UserRoleState;
}
