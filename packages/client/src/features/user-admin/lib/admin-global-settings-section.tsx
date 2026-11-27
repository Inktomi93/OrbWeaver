// The Global settings settings-SECTION CONTRIBUTION user-admin exports on its front door; main.tsx assembles it into
// the ONE settings-section registry at the `admin` anchor.
//
// No `owns` claim: the section only reads rows the owning ports write, so it is exempt from the §2.3 key
// partition. No `when`: the admin pane carries the viewer gate.

import type { ConfigSectionContribution } from "#state";
import { AdminGlobalSettingsSection } from "../components/admin-global-settings-section.tsx";
import { ADMIN_GLOBAL_SETTINGS_SUBCATEGORY } from "./admin-global-settings-nav.ts";

export const adminGlobalSettingsSection: ConfigSectionContribution = {
  id: "admin-global-settings",
  anchor: "admin",
  nav: ADMIN_GLOBAL_SETTINGS_SUBCATEGORY,
  body: (anchorId) => <AdminGlobalSettingsSection anchorId={anchorId} />,
};
