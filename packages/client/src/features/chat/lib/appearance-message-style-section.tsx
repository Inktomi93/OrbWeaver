// The Message-style appearance settings-SECTION CONTRIBUTION (SET-SEAMS stage 1) — the co-located
// definition the chat feature exports on its front door; the composition root (main.tsx) assembles it into
// the ONE settings-section registry, and the appearance pane (a `{kind:"sections"}` skimmer now) renders it
// at its anchor. Chat OWNS these knobs because chat READS them (§6).

import type { SettingsSectionContribution } from "#state";
import { AppearanceMessageStyleSection } from "../components/appearance-message-style-section";
import { APPEARANCE_MESSAGE_STYLE_KEYS, APPEARANCE_MESSAGE_STYLE_SUBCATEGORY } from "./appearance-message-style-model";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "appearance-message-style";

export const appearanceMessageStyleSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: APPEARANCE_MESSAGE_STYLE_SUBCATEGORY,
  owns: { tier: "user", section: "appearance", keys: APPEARANCE_MESSAGE_STYLE_KEYS },
  body: () => <AppearanceMessageStyleSection sectionId={SECTION_ID} />,
};
