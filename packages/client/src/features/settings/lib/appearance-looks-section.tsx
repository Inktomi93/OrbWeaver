// The LOOKS config-section CONTRIBUTION (#866 S4 / #297 — config-revamp-design.md §7.3): the theme
// picker + builder, folded INTO Appearance from the retired rail-foot `theme` modal (owner ruling F-2,
// 2026-08-30). First at the `appearance` anchor — a look is the FIRST appearance decision; everything
// under the "Customize this look" fold rides on top of it. Claims the `theme` namespace's ONE key
// (`selectedThemeId` — override values live on the selected `themes` ROW, never inline, §12.1), so the
// partition covers it and `@modified` can say a non-default look is applied.

import type { ConfigSectionContribution } from "#state";
import { AppearanceLooksSection } from "../components/appearance-looks-section.tsx";
import { APPEARANCE_LOOKS_SUBCATEGORY } from "./appearance-looks-nav.ts";

export const appearanceLooksSection: ConfigSectionContribution = {
  id: "appearance-looks",
  anchor: "appearance",
  nav: APPEARANCE_LOOKS_SUBCATEGORY,
  owns: { tier: "user", section: "theme", keys: ["selectedThemeId"] },
  body: () => <AppearanceLooksSection />,
};
