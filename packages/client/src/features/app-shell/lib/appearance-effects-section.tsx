// The Effects appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the co-located definition
// app-shell exports on its front door; the composition root assembles it into the ONE settings-section
// registry and the appearance skimmer pane renders it at its anchor.

import type { ConfigSectionContribution } from "#state";
import { AppearanceEffectsSection } from "../components/appearance-effects-section.tsx";
import { APPEARANCE_EFFECTS_KEYS, APPEARANCE_EFFECTS_SUBCATEGORY } from "./appearance-effects-model.ts";

const SECTION_ID = "appearance-effects";

export const appearanceEffectsSection: ConfigSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  // Inside the Appearance group's "Customize this look" fold (#297's explicit custom arm, #866 S4).
  advanced: true,
  nav: APPEARANCE_EFFECTS_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_EFFECTS_KEYS },
  body: () => <AppearanceEffectsSection sectionId={SECTION_ID} />,
};
