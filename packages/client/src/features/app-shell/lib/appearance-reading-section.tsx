// The "Reading typography" appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the co-located
// definition app-shell exports on its front door; the composition root assembles it into the ONE
// settings-section registry and the appearance skimmer pane renders it at its anchor.

import type { SettingsSectionContribution } from "#state";
import { AppearanceReadingSection } from "../components/appearance-reading-section.tsx";
import { APPEARANCE_READING_KEYS, APPEARANCE_READING_SUBCATEGORY } from "./appearance-reading-model.ts";

const SECTION_ID = "appearance-reading";

export const appearanceReadingSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_READING_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_READING_KEYS },
  body: () => <AppearanceReadingSection sectionId={SECTION_ID} />,
};
