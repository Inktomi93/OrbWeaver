// The About group's two section contributions, assembled by `compose/config-sections.ts` at the `about` anchor.
// The version section is UNGATED: `settings.getVersion` is any authed caller's read, so a member can quote it.
// The update check is admin-only, because the box is the operator's to update; neither persists anything.

import type { ConfigSectionContribution } from "#state";
import { AboutSection, AboutUpdatesSection } from "../components/about-section.tsx";
import { ABOUT_SUBCATEGORY, ABOUT_UPDATES_SUBCATEGORY } from "./about-nav.ts";

export const aboutSection: ConfigSectionContribution = {
  id: "about-version",
  anchor: "about",
  nav: ABOUT_SUBCATEGORY,
  body: () => <AboutSection />,
};

export const aboutUpdatesSection: ConfigSectionContribution = {
  id: "about-updates",
  anchor: "about",
  nav: ABOUT_UPDATES_SUBCATEGORY,
  when: (viewer) => viewer.isAdmin,
  body: () => <AboutUpdatesSection />,
};
