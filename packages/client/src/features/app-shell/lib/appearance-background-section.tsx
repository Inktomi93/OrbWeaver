// The Background appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the co-located definition
// app-shell exports on its front door; the composition root assembles it into the ONE settings-section
// registry and the appearance skimmer pane renders it at its anchor.

import type { ConfigSectionContribution } from "#state";
import { AppearanceBackgroundSection } from "../components/appearance-background-section.tsx";
import { APPEARANCE_BACKGROUND_KEYS, APPEARANCE_BACKGROUND_LIBRARY_KEYS, APPEARANCE_BACKGROUND_SUBCATEGORY } from "./appearance-background-model.ts";

const SECTION_ID = "appearance-background";

export const appearanceBackgroundSection: ConfigSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_BACKGROUND_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_BACKGROUND_KEYS, libraryKeys: APPEARANCE_BACKGROUND_LIBRARY_KEYS },
  body: () => <AppearanceBackgroundSection sectionId={SECTION_ID} />,
};
