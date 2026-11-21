import { adminLinkSsoSection } from "@orb/client/features/user-admin";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production Link SSO identity contribution: one Link door per unbound, non-owner account. */
export function AdminLinkSsoStory(): ReactElement {
  return <CtClientProviders>{adminLinkSsoSection.body("admin-link-sso-subject")}</CtClientProviders>;
}
