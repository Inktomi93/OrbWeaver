// B5 — the "Link SSO identity" settings-SECTION CONTRIBUTION user-admin exports on its front door; main.tsx
// assembles it into the ONE settings-section registry at the `admin` anchor, right after Approvals.
//
// No `owns` claim: the section persists nothing through the settings tiers — accounts are rows behind the
// `admin.*` verbs, so it is exempt from the §2.3 key partition. No `when`: the ADMIN PANE carries the viewer
// gate (`when: viewer.isAdmin`), and a section only ever renders inside a visible pane.

import type { SettingsSectionContribution } from "#state";
import { AdminLinkSsoSection } from "../components/admin-link-sso-section.tsx";
import { ADMIN_LINK_SSO_SUBCATEGORY } from "./admin-link-sso-nav.ts";

export const adminLinkSsoSection: SettingsSectionContribution = {
  id: "admin-link-sso",
  anchor: "admin",
  nav: ADMIN_LINK_SSO_SUBCATEGORY,
  body: () => <AdminLinkSsoSection />,
};
