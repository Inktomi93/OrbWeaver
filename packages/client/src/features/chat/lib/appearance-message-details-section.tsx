// The "Message details & actions" appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the
// co-located definition the chat feature exports on its front door; the composition root assembles it into
// the ONE settings-section registry and the appearance skimmer pane renders it at its anchor.

import type { SettingsSectionContribution } from "#state";
import { AppearanceMessageDetailsSection } from "../components/appearance-message-details-section.tsx";
import { APPEARANCE_MESSAGE_DETAILS_KEYS, APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY } from "./appearance-message-details-model.ts";

const SECTION_ID = "appearance-message-details";

export const appearanceMessageDetailsSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_MESSAGE_DETAILS_KEYS },
  body: () => <AppearanceMessageDetailsSection sectionId={SECTION_ID} />,
};
