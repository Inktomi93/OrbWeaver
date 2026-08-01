// The "Sizing & motion" appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the co-located
// definition app-shell exports on its front door; the composition root assembles it into the ONE
// settings-section registry and the appearance skimmer pane renders it at its anchor.

import type { SettingsSectionContribution } from "#state";
import { AppearanceSizingSection } from "../components/appearance-sizing-section";
import { APPEARANCE_SIZING_KEYS, APPEARANCE_SIZING_SUBCATEGORY } from "./appearance-sizing-model";

const SECTION_ID = "appearance-sizing";

export const appearanceSizingSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_SIZING_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_SIZING_KEYS },
  body: () => <AppearanceSizingSection sectionId={SECTION_ID} />,
};
