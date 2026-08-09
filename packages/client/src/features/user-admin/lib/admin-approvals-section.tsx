// A2 — the Approvals settings-SECTION CONTRIBUTION user-admin exports on its front door; main.tsx assembles
// it into the ONE settings-section registry at the `admin` anchor, right after Users.
//
// No `owns` claim: the section persists nothing through the settings tiers — accounts are rows behind the
// `admin.*` verbs, so it is exempt from the §2.3 key partition. No `when`: the ADMIN PANE carries the viewer
// gate (`when: viewer.isAdmin`), and a section only ever renders inside a visible pane.

import type { SettingsSectionContribution } from "#state";
import { AdminApprovalsSection } from "../components/admin-approvals-section.tsx";
import { ADMIN_APPROVALS_SUBCATEGORY } from "./admin-approvals-nav.ts";

export const adminApprovalsSection: SettingsSectionContribution = {
  id: "admin-approvals",
  anchor: "admin",
  nav: ADMIN_APPROVALS_SUBCATEGORY,
  body: () => <AdminApprovalsSection />,
};
