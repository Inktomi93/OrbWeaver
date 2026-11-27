import { adminGlobalSettingsSection } from "@orb/client/features/user-admin";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production Admin Global settings contribution: the read-only list of the stored server-wide rows. */
export function AdminGlobalSettingsStory(): ReactElement {
  return <CtClientProviders>{adminGlobalSettingsSection.body("admin-global-settings-subject")}</CtClientProviders>;
}
