import type { UserRole } from "@orb/contracts/identity";
import type { StatusVocabulary } from "./status-chip.tsx";

/** The account role chip, shared by the admin rows and the switcher's account foot. */
export const USER_ROLE_STATUS: StatusVocabulary<UserRole> = {
  owner: { label: "Owner", tone: "primary" },
  admin: { label: "Admin", tone: "info" },
  user: { label: "User", tone: "neutral" },
};
