// The Effects appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the co-located definition
// app-shell exports on its front door; the composition root assembles it into the ONE settings-section
// registry and the appearance skimmer pane renders it at its anchor.

import type { SettingsSectionContribution } from "#state";
import { AppearanceEffectsSection } from "../components/appearance-effects-section";
import { APPEARANCE_EFFECTS_KEYS, APPEARANCE_EFFECTS_SUBCATEGORY } from "./appearance-effects-model";

const SECTION_ID = "appearance-effects";

export const appearanceEffectsSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_EFFECTS_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_EFFECTS_KEYS },
  body: () => <AppearanceEffectsSection sectionId={SECTION_ID} />,
};
