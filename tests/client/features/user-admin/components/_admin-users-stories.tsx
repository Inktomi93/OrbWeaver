import { adminUsersSection } from "@orb/client/features/user-admin";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production Admin users contribution: one row per account, each with its own enabled switch. */
export function AdminUsersStory(): ReactElement {
  return <CtClientProviders>{adminUsersSection.body("admin-users-subject")}</CtClientProviders>;
}
