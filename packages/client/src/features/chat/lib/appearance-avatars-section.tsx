// The Avatars appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the co-located definition the
// chat feature exports on its front door; the composition root assembles it into the ONE settings-section
// registry and the appearance skimmer pane renders it at its anchor.

import type { SettingsSectionContribution } from "#state";
import { AppearanceAvatarsSection } from "../components/appearance-avatars-section";
import { APPEARANCE_AVATARS_KEYS, APPEARANCE_AVATARS_SUBCATEGORY } from "./appearance-avatars-model";

const SECTION_ID = "appearance-avatars";

export const appearanceAvatarsSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_AVATARS_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_AVATARS_KEYS },
  body: () => <AppearanceAvatarsSection sectionId={SECTION_ID} />,
};
