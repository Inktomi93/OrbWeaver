// The Users settings-SECTION CONTRIBUTION (SET-SEAMS stage 3) — the co-located def user-admin exports on
// its front door; main.tsx assembles it into the ONE settings-section registry at the `admin` anchor.
//
// No `owns` claim: the section persists nothing through the settings tiers — accounts are rows behind the
// `admin.*` verbs, so it is exempt from the §2.3 key partition. No `when` either: the ADMIN PANE carries the
// viewer gate (`when: viewer.isAdmin`), and nav/search/render of a section only ever run inside a visible
// pane — a second predicate here would be a parallel truth that can drift.

import type { SettingsSectionContribution } from "#state";
import { AdminUsersSection } from "../components/admin-users-section.tsx";
import { ADMIN_USERS_SUBCATEGORY } from "./admin-users-nav.ts";

export const adminUsersSection: SettingsSectionContribution = {
  id: "admin-users",
  anchor: "admin",
  nav: ADMIN_USERS_SUBCATEGORY,
  body: () => <AdminUsersSection />,
};
