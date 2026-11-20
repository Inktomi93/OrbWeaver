// The "Accessibility" appearance settings-SECTION CONTRIBUTION — the co-located definition app-shell exports on its
// front door; the composition root assembles it into the ONE settings-section registry.

import type { ConfigSectionContribution } from "#state";
import { AppearanceAccessibilitySection } from "../components/appearance-accessibility-section.tsx";
import { APPEARANCE_ACCESSIBILITY_KEYS, APPEARANCE_ACCESSIBILITY_SUBCATEGORY } from "./appearance-accessibility-model.ts";

const SECTION_ID = "appearance-accessibility";

export const appearanceAccessibilitySection: ConfigSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_ACCESSIBILITY_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_ACCESSIBILITY_KEYS },
  body: (anchorId) => <AppearanceAccessibilitySection anchorId={anchorId} sectionId={SECTION_ID} />,
};
